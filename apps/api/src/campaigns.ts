import type { S3Client } from '@aws-sdk/client-s3';
import {
  MAX_PENDING_PLEDGES,
  belemToday,
  campaignCloseSchema,
  campaignConfirmSchema,
  campaignCreateSchema,
  campaignDecisionNoteSchema,
  campaignEntrySchema,
  campaignListQuerySchema,
  campaignPhase,
  campaignPledgeSchema,
  campaignTotals,
  campaignUpdateSchema,
  campaignVoidSchema,
  looksLikeAnimalSale,
} from '@patinha/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { publicMediaUrl, verifyUploadedImages } from './media.js';
import { captureServerError } from './monitoring.js';
import { notifyPeople } from './notify.js';
import { resolveAnimal } from './passport.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type Db = Pool | PoolClient;
type RouteLimit = { config: object };

const ENTRIES_LIMIT = 300;
const EVENTS_LIMIT = 150;
/** Campanhas ativas ao mesmo tempo por responsável: o bastante para uma ONG, pouco para spam. */
const MAX_ACTIVE_PER_OWNER = 10;

const idParams = z.object({ id: z.string().uuid() });
const entryParams = z.object({ id: z.string().uuid(), entryId: z.string().uuid() });

function parseId(params: unknown): string {
  const parsed = idParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Essa campanha não existe.');
  return parsed.data.id;
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((issue) => issue.code === z.ZodIssueCode.custom);
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

function clean(value: string): string {
  return stripControls(value).trim();
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.500,00" com espaço comum, para o texto ler igual no app e no push. */
export function formatCents(cents: number): string {
  return brl.format(cents / 100).replace(/ /g, ' ');
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return year && month && date ? `${date}/${month}/${year}` : day;
}

/** Equipe que vê comprovantes de doação e anula lançamentos: operadores e revisão financeira. */
function isFinanceStaff(user: SessionUser | null): boolean {
  return user !== null && (isOperator(user.role) || user.role === 'finance_reviewer');
}

async function withTransaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function bestEffort(request: FastifyRequest, where: string) {
  return (error: unknown) => {
    request.log.error({ err: error, where }, 'best-effort step failed');
    captureServerError(error, { where, requestId: request.id, userId: request.user?.id });
  };
}

export type CampaignActor = 'owner' | 'donor' | 'staff' | 'system';

/** Uma linha no histórico. Nunca é editada nem apagada (gatilho no banco). */
export async function logCampaignEvent(
  db: Db,
  event: {
    campaignId: string;
    actorId: string | null;
    actorKind: CampaignActor;
    action: string;
    entryId?: string | null;
    before?: unknown;
    after?: unknown;
    note?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO campaign_events (campaign_id, actor_id, actor_kind, action, entry_id, before, after, note)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      event.campaignId,
      event.actorId,
      event.actorKind,
      event.action,
      event.entryId ?? null,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
      event.note ?? null,
    ],
  );
}

interface CampaignRow {
  id: string;
  owner_id: string;
  animal_id: string | null;
  post_id: string | null;
  title: string;
  purpose: string;
  goal_cents: number;
  deadline: string;
  pix_key: string;
  status: 'active' | 'closed' | 'suspended';
  closing_note: string | null;
  closed_at: Date | null;
  suspended_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

const campaignColumns = `c.id, c.owner_id, c.animal_id, c.post_id, c.title, c.purpose, c.goal_cents,
  to_char(c.deadline, 'YYYY-MM-DD') AS deadline, c.pix_key, c.status, c.closing_note, c.closed_at,
  c.suspended_reason, c.created_at, c.updated_at`;

async function lockCampaign(client: PoolClient, id: string): Promise<CampaignRow> {
  const found = await client.query<CampaignRow>(
    `SELECT ${campaignColumns} FROM campaigns c WHERE c.id = $1 FOR UPDATE`,
    [id],
  );
  const row = found.rows[0];
  if (!row) throw new HttpError(404, 'Essa campanha não existe.');
  return row;
}

function assertOwner(campaign: CampaignRow, user: SessionUser): void {
  if (campaign.owner_id !== user.id) {
    throw new HttpError(403, 'Só o responsável pela campanha pode fazer isso.');
  }
}

function assertNotSuspended(campaign: CampaignRow): void {
  if (campaign.status === 'suspended') {
    throw new HttpError(409, 'A equipe suspendeu esta campanha enquanto confere uma denúncia.');
  }
}

/** Animal e post ligados, já resolvidos: post de outro animal não entra. */
async function resolveLinks(
  db: Db,
  input: { animalId?: string; postId?: string },
): Promise<{ animalId: string | null; postId: string | null }> {
  let animalId: string | null = null;
  let postId: string | null = null;
  if (input.postId) {
    const post = await db.query<{ animal_id: string }>(
      `SELECT animal_id FROM posts
       WHERE id = $1 AND parent_post_id IS NULL AND hidden = false AND review_status = 'published'`,
      [input.postId],
    );
    const raw = post.rows[0]?.animal_id;
    if (!raw) throw new HttpError(404, 'Não achei o caso dessa campanha.');
    postId = input.postId;
    animalId = await resolveAnimal(db, raw);
  }
  if (input.animalId) {
    const resolved = await resolveAnimal(db, input.animalId);
    if (!resolved) throw new HttpError(404, 'Esse animal não existe.');
    if (animalId && animalId !== resolved) {
      throw new HttpError(400, 'O caso escolhido é de outro animal.');
    }
    animalId = resolved;
  }
  return { animalId, postId };
}

/** O animal e as ocorrências juntadas a ele no passaporte. */
async function animalFamily(db: Db, animalId: string): Promise<string[]> {
  const resolved = await resolveAnimal(db, animalId);
  if (!resolved) return [];
  const merged = await db.query<{ id: string }>(
    `SELECT id FROM animals WHERE merged_into_id = $1`,
    [resolved],
  );
  return [resolved, ...merged.rows.map((row) => row.id)];
}

interface ListRow extends CampaignRow {
  owner_name: string;
  owner_handle: string;
  owner_verified: boolean;
  owner_avatar: string | null;
  raised: string;
  spent: string;
  cover: string | null;
}

/** Lista para a tela de campanhas, o passaporte e o caso. Suspensa só aparece em "minhas". */
export async function listCampaigns(
  pool: Pool,
  env: Env,
  viewer: SessionUser | null,
  rawQuery: unknown,
) {
  const query = parse(campaignListQuerySchema, rawQuery ?? {});
  const today = belemToday();
  const conditions: string[] = ['ou.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.status === 'mine') {
    const user = requireUser(viewer);
    conditions.push(`c.owner_id = ${add(user.id)}`);
  } else {
    conditions.push(`c.status <> 'suspended'`, 'ou.suspended = false');
    const day = add(today);
    conditions.push(
      query.status === 'open'
        ? `c.status = 'active' AND c.deadline >= ${day}::date`
        : `(c.status = 'closed' OR (c.status = 'active' AND c.deadline < ${day}::date))`,
    );
  }
  if (query.animalId) {
    const family = await animalFamily(pool, query.animalId);
    if (family.length === 0) return { campaigns: [] };
    conditions.push(`c.animal_id = ANY(${add(family)}::uuid[])`);
  }
  if (query.postId) conditions.push(`c.post_id = ${add(query.postId)}`);
  const limit = add(query.limit);
  const result = await pool.query<ListRow>(
    `SELECT ${campaignColumns},
            ou.name AS owner_name, ou.handle AS owner_handle, ou.verified AS owner_verified,
            ou.avatar_url AS owner_avatar,
            COALESCE(sum(e.amount_cents) FILTER (WHERE e.kind = 'donation' AND e.status = 'confirmed'), 0)::text AS raised,
            COALESCE(sum(e.amount_cents) FILTER (WHERE e.kind = 'expense' AND e.status = 'confirmed'), 0)::text AS spent,
            (SELECT m.url FROM post_media m JOIN posts p ON p.id = m.post_id
              WHERE p.hidden = false AND p.parent_post_id IS NULL
                AND (p.id = c.post_id OR (c.post_id IS NULL AND p.animal_id = c.animal_id))
              ORDER BY p.created_at ASC, m.position ASC LIMIT 1) AS cover
     FROM campaigns c
     JOIN users ou ON ou.id = c.owner_id
     LEFT JOIN campaign_entries e ON e.campaign_id = c.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.id, ou.id
     ORDER BY ${query.status === 'open' ? 'c.deadline ASC, c.created_at DESC' : 'c.updated_at DESC'}
     LIMIT ${limit}`,
    params,
  );
  return {
    campaigns: result.rows.map((row) => {
      const raised = Number(row.raised);
      const spent = Number(row.spent);
      return {
        id: row.id,
        title: row.title,
        goalCents: row.goal_cents,
        raisedCents: raised,
        spentCents: spent,
        deadline: row.deadline,
        phase: campaignPhase(row.status, row.deadline, today),
        animalId: row.animal_id,
        postId: row.post_id,
        coverUrl: row.cover ? publicMediaUrl(env, row.cover, 'thumb') : null,
        owner: {
          name: row.owner_name,
          handle: row.owner_handle,
          verified: row.owner_verified,
          avatarUrl: row.owner_avatar,
        },
        createdAt: row.created_at.toISOString(),
      };
    }),
  };
}

interface EntryRow {
  id: string;
  kind: 'donation' | 'expense';
  amount_cents: number;
  description: string;
  occurred_on: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'voided';
  receipt_key: string | null;
  created_by: string | null;
  creator_name: string | null;
  show_name: boolean;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}

interface EventRow {
  id: string;
  actor_kind: CampaignActor;
  action: string;
  entry_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: Date;
}

const fieldLabels: Record<string, string> = {
  title: 'título',
  purpose: 'justificativa',
  goalCents: 'meta',
  deadline: 'prazo',
  pixKey: 'chave Pix',
};

function describeValue(field: string, value: unknown): string {
  if (field === 'goalCents' && typeof value === 'number') return formatCents(value);
  if (field === 'deadline' && typeof value === 'string') return formatDay(value);
  return typeof value === 'string' ? value : '';
}

/** O texto de cada linha do histórico, montado no servidor para o app e o painel lerem igual. */
export function describeEvent(row: {
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}): string {
  const after = row.after ?? {};
  const before = row.before ?? {};
  const amount = typeof after.amountCents === 'number' ? formatCents(after.amountCents) : '';
  switch (row.action) {
    case 'created':
      return 'Campanha criada';
    case 'edited': {
      const parts = Object.keys(after)
        .filter((field) => field in fieldLabels)
        .map((field) =>
          field === 'purpose'
            ? 'justificativa reescrita'
            : `${fieldLabels[field]} de ${describeValue(field, before[field])} para ${describeValue(field, after[field])}`,
        );
      return `Campanha editada: ${parts.join('; ')}`;
    }
    case 'entry_added':
      return after.kind === 'expense'
        ? `Despesa de ${amount}: ${String(after.description ?? '')}`
        : `Doação de ${amount} registrada pelo responsável`;
    case 'pledge_created':
      return `Aviso de doação de ${amount}`;
    case 'pledge_confirmed':
      return `Doação de ${amount} confirmada com comprovante`;
    case 'pledge_rejected':
      return `Aviso de doação de ${amount} recusado`;
    case 'entry_voided':
      return `Lançamento de ${amount} anulado`;
    case 'closed':
      return 'Campanha encerrada com prestação de contas';
    case 'suspended':
      return 'Suspensa pela equipe para conferência';
    case 'reinstated':
      return 'Liberada pela equipe depois da conferência';
    default:
      return 'Atualização';
  }
}

const actorLabels: Record<CampaignActor, string> = {
  owner: 'Responsável',
  donor: 'Quem doou',
  staff: 'Equipe',
  system: 'Égua, adota!',
};

export async function loadCampaign(pool: Pool, env: Env, id: string, viewer: SessionUser | null) {
  const found = await pool.query<
    CampaignRow & {
      owner_name: string;
      owner_handle: string;
      owner_verified: boolean;
      owner_avatar: string | null;
      owner_suspended: boolean;
      owner_deleted: boolean;
    }
  >(
    `SELECT ${campaignColumns}, u.name AS owner_name, u.handle AS owner_handle,
            u.verified AS owner_verified, u.avatar_url AS owner_avatar,
            u.suspended AS owner_suspended, u.deleted_at IS NOT NULL AS owner_deleted
     FROM campaigns c JOIN users u ON u.id = c.owner_id
     WHERE c.id = $1`,
    [id],
  );
  const campaign = found.rows[0];
  if (!campaign) throw new HttpError(404, 'Essa campanha não existe.');
  const isOwner = viewer !== null && viewer.id === campaign.owner_id;
  const staff = isFinanceStaff(viewer);
  const today = belemToday();
  const phase = campaignPhase(campaign.status, campaign.deadline, today);

  const [entries, events, animal, post, cover] = await Promise.all([
    pool.query<EntryRow>(
      `SELECT e.id, e.kind, e.amount_cents, e.description,
              to_char(e.occurred_on, 'YYYY-MM-DD') AS occurred_on, e.status, e.receipt_key,
              e.created_by, u.name AS creator_name, e.show_name, e.decided_at, e.decision_note,
              e.created_at
       FROM campaign_entries e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.campaign_id = $1
       ORDER BY e.occurred_on DESC, e.created_at DESC
       LIMIT ${ENTRIES_LIMIT}`,
      [id],
    ),
    pool.query<EventRow>(
      `SELECT id::text, actor_kind, action, entry_id, before, after, note, created_at
       FROM campaign_events WHERE campaign_id = $1
       ORDER BY created_at DESC, id DESC LIMIT ${EVENTS_LIMIT}`,
      [id],
    ),
    campaign.animal_id
      ? pool.query<{ id: string; name: string | null; species: string }>(
          `SELECT id, name, species FROM animals WHERE id = $1`,
          [campaign.animal_id],
        )
      : null,
    campaign.post_id
      ? pool.query<{ id: string; approx_label: string; type: string }>(
          `SELECT id, approx_label, type FROM posts WHERE id = $1 AND hidden = false`,
          [campaign.post_id],
        )
      : null,
    pool.query<{ url: string }>(
      `SELECT m.url FROM post_media m JOIN posts p ON p.id = m.post_id
       WHERE p.hidden = false AND p.parent_post_id IS NULL
         AND (p.id = $1 OR ($1::uuid IS NULL AND p.animal_id = $2))
       ORDER BY p.created_at ASC, m.position ASC LIMIT 1`,
      [campaign.post_id, campaign.animal_id],
    ),
  ]);

  // Pendente e recusado são entre quem avisou, o responsável e a equipe.
  const visibleEntry = (row: EntryRow) =>
    row.status === 'confirmed' ||
    row.status === 'voided' ||
    isOwner ||
    staff ||
    (viewer !== null && row.created_by === viewer.id);
  // Comprovante de despesa é público; o de doação pode ter CPF e banco de quem doou.
  const visibleReceipt = (row: EntryRow) =>
    row.kind === 'expense' || isOwner || staff || (viewer !== null && row.created_by === viewer.id);

  const allEntries = entries.rows;
  const totals = campaignTotals(
    allEntries.map((row) => ({
      kind: row.kind,
      status: row.status,
      amountCents: row.amount_cents,
    })),
  );
  const visible = allEntries.filter(visibleEntry);
  const visibleIds = new Set(visible.map((row) => row.id));
  const allIds = new Set(allEntries.map((row) => row.id));

  const pixVisible =
    phase === 'active' &&
    campaign.owner_verified &&
    !campaign.owner_suspended &&
    !campaign.owner_deleted;

  return {
    id: campaign.id,
    title: campaign.title,
    purpose: campaign.purpose,
    goalCents: campaign.goal_cents,
    deadline: campaign.deadline,
    phase,
    closingNote: campaign.closing_note,
    closedAt: campaign.closed_at?.toISOString() ?? null,
    suspendedReason: phase === 'suspended' ? campaign.suspended_reason : null,
    createdAt: campaign.created_at.toISOString(),
    updatedAt: campaign.updated_at.toISOString(),
    pixKey: pixVisible ? campaign.pix_key : null,
    paymentNotice:
      'O app não recebe nem repassa dinheiro. O Pix vai direto para o responsável verificado, e só conta no progresso o que ele confirmar com comprovante.',
    coverUrl: cover.rows[0] ? publicMediaUrl(env, cover.rows[0].url, 'full') : null,
    owner: {
      name: campaign.owner_name,
      handle: campaign.owner_handle,
      verified: campaign.owner_verified,
      avatarUrl: campaign.owner_avatar,
    },
    animal: animal?.rows[0]
      ? { id: animal.rows[0].id, name: animal.rows[0].name, species: animal.rows[0].species }
      : null,
    post: post?.rows[0]
      ? { id: post.rows[0].id, approxLabel: post.rows[0].approx_label, type: post.rows[0].type }
      : null,
    totals: {
      raisedCents: totals.raisedCents,
      spentCents: totals.spentCents,
      balanceCents: totals.balanceCents,
      // O valor pendente não é de ninguém além de quem decide: aparece só para o responsável.
      pendingCents: isOwner || staff ? totals.pendingCents : null,
      pendingCount: isOwner || staff ? totals.pendingCount : null,
      confirmedDonations: allEntries.filter(
        (row) => row.kind === 'donation' && row.status === 'confirmed',
      ).length,
    },
    entries: visible.map((row) => {
      const byOwner = row.created_by === campaign.owner_id;
      const mine = viewer !== null && row.created_by === viewer.id;
      return {
        id: row.id,
        kind: row.kind,
        amountCents: row.amount_cents,
        description: row.description,
        occurredOn: row.occurred_on,
        status: row.status,
        who:
          row.kind === 'expense' || byOwner
            ? 'Responsável'
            : row.show_name && row.creator_name
              ? firstName(row.creator_name)
              : 'Doação anônima',
        mine,
        hasReceipt: row.receipt_key !== null,
        receipt:
          row.receipt_key && visibleReceipt(row)
            ? {
                url: publicMediaUrl(env, row.receipt_key, 'full'),
                thumbUrl: publicMediaUrl(env, row.receipt_key, 'thumb'),
              }
            : null,
        decisionNote: row.decision_note,
        decidedAt: row.decided_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
      };
    }),
    history: events.rows
      .filter((row) => !row.entry_id || visibleIds.has(row.entry_id) || !allIds.has(row.entry_id))
      .map((row) => ({
        id: row.id,
        action: row.action,
        actor: actorLabels[row.actor_kind] ?? 'Égua, adota!',
        summary: describeEvent(row),
        note: row.note,
        createdAt: row.created_at.toISOString(),
      })),
    permissions: {
      isOwner,
      isStaff: staff,
      canEdit: isOwner && campaign.status === 'active',
      canAddEntries: isOwner && campaign.status === 'active',
      canClose: isOwner && campaign.status === 'active',
      canPledge: viewer !== null && !isOwner && pixVisible,
      canReport: viewer !== null && !isOwner,
    },
  };
}

async function replayEntry(db: Db, userId: string, clientKey: string | undefined) {
  if (!clientKey) return null;
  const found = await db.query<{ id: string; campaign_id: string }>(
    `SELECT id, campaign_id FROM campaign_entries WHERE created_by = $1 AND client_key = $2`,
    [userId, clientKey],
  );
  return found.rows[0] ?? null;
}

/**
 * "Excluir conta": o livro-caixa continua (é prestação de contas para quem doou), mas o nome de
 * quem doou sai, avisos sem resposta caem e campanha aberta da pessoa é encerrada.
 */
export async function closeCampaignsOf(db: Db, userId: string): Promise<void> {
  await db.query(`UPDATE campaign_entries SET show_name = false WHERE created_by = $1`, [userId]);
  const dropped = await db.query<{ id: string; campaign_id: string; amount_cents: number }>(
    `UPDATE campaign_entries
     SET status = 'rejected', decided_at = now(), decision_note = 'Conta de quem avisou foi excluída.'
     WHERE created_by = $1 AND status = 'pending'
     RETURNING id, campaign_id, amount_cents`,
    [userId],
  );
  for (const row of dropped.rows) {
    await logCampaignEvent(db, {
      campaignId: row.campaign_id,
      actorId: null,
      actorKind: 'system',
      action: 'pledge_rejected',
      entryId: row.id,
      before: { status: 'pending' },
      after: { status: 'rejected', amountCents: row.amount_cents },
      note: 'Conta de quem avisou foi excluída.',
    });
  }
  const closed = await db.query<{ id: string }>(
    `UPDATE campaigns
     SET status = 'closed', closed_at = now(), updated_at = now(),
         closing_note = 'Campanha encerrada porque a conta do responsável foi excluída.'
     WHERE owner_id = $1 AND status = 'active'
     RETURNING id`,
    [userId],
  );
  for (const row of closed.rows) {
    await logCampaignEvent(db, {
      campaignId: row.id,
      actorId: null,
      actorKind: 'system',
      action: 'closed',
      before: { status: 'active' },
      after: { status: 'closed' },
      note: 'A conta do responsável foi excluída.',
    });
  }
}

/** Suspende pela denúncia ou pelo painel: some das listas e o Pix sai do ar. */
export async function setCampaignSuspended(
  client: PoolClient,
  input: { campaignId: string; actorId: string | null; suspended: boolean; reason: string },
): Promise<{ ownerId: string; changed: boolean } | null> {
  const found = await client.query<{ owner_id: string; status: string; closed_at: Date | null }>(
    `SELECT owner_id, status, closed_at FROM campaigns WHERE id = $1 FOR UPDATE`,
    [input.campaignId],
  );
  const row = found.rows[0];
  if (!row) return null;
  if (input.suspended === (row.status === 'suspended')) {
    return { ownerId: row.owner_id, changed: false };
  }
  const next = input.suspended ? 'suspended' : row.closed_at ? 'closed' : 'active';
  await client.query(
    `UPDATE campaigns SET status = $2, suspended_reason = $3, updated_at = now() WHERE id = $1`,
    [input.campaignId, next, input.suspended ? input.reason : null],
  );
  await logCampaignEvent(client, {
    campaignId: input.campaignId,
    actorId: input.actorId,
    actorKind: 'staff',
    action: input.suspended ? 'suspended' : 'reinstated',
    before: { status: row.status },
    after: { status: next },
    note: input.reason,
  });
  return { ownerId: row.owner_id, changed: true };
}

export async function notifyCampaignSuspension(
  pool: Pool,
  env: Env,
  campaignId: string,
  ownerId: string,
  suspended: boolean,
): Promise<void> {
  await notifyPeople(pool, env, [ownerId], 'campaign', {
    title: suspended ? 'Campanha suspensa para conferência' : 'Campanha liberada',
    body: suspended
      ? 'A equipe recebeu uma denúncia e suspendeu a campanha enquanto confere. O Pix saiu do ar.'
      : 'A equipe conferiu e liberou a campanha de novo.',
    route: `/campanha/${campaignId}`,
  });
}

export function registerCampaignRoutes(
  app: FastifyInstance,
  deps: {
    env: Env;
    pool: Pool;
    storage: S3Client;
    writeLimit: RouteLimit;
    publishLimit: RouteLimit;
  },
): void {
  const { env, pool, storage, writeLimit, publishLimit } = deps;

  const checkReceipt = (userId: string, key: string) =>
    verifyUploadedImages(env, storage, userId, [key]);

  app.get('/campaigns', async (request) => listCampaigns(pool, env, request.user, request.query));

  app.get('/campaigns/:id', async (request) =>
    loadCampaign(pool, env, parseId(request.params), request.user),
  );

  app.post('/campaigns', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    if (!user.verified && !isOperator(user.role)) {
      throw new HttpError(
        403,
        'Só ONGs e protetores verificados abrem campanha. Peça a verificação no seu perfil.',
      );
    }
    const input = parse(campaignCreateSchema, request.body);
    const title = clean(input.title);
    const purpose = clean(input.purpose);
    const pixKey = clean(input.pixKey);
    if (looksLikeAnimalSale(title) || looksLikeAnimalSale(purpose)) {
      throw new HttpError(400, 'Não é permitido vender animais.');
    }
    if (input.clientKey) {
      const replay = await pool.query<{ id: string }>(
        `SELECT id FROM campaigns WHERE owner_id = $1 AND client_key = $2`,
        [user.id, input.clientKey],
      );
      if (replay.rows[0]) return reply.code(200).send({ id: replay.rows[0].id });
    }
    const links = await resolveLinks(pool, input);
    try {
      const id = await withTransaction(pool, async (client) => {
        // Trava as campanhas da pessoa: dois toques ao mesmo tempo não passam do limite juntos.
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
        const active = await client.query<{ total: number; same_animal: number }>(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE $2::uuid IS NOT NULL AND animal_id = $2)::int AS same_animal
           FROM campaigns WHERE owner_id = $1 AND status = 'active'`,
          [user.id, links.animalId],
        );
        if ((active.rows[0]?.same_animal ?? 0) > 0) {
          throw new HttpError(409, 'Você já tem uma campanha aberta para esse animal.');
        }
        if ((active.rows[0]?.total ?? 0) >= MAX_ACTIVE_PER_OWNER) {
          throw new HttpError(409, 'Encerre uma campanha antes de abrir outra.');
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO campaigns
             (owner_id, animal_id, post_id, title, purpose, goal_cents, deadline, pix_key, client_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            user.id,
            links.animalId,
            links.postId,
            title,
            purpose,
            input.goalCents,
            input.deadline,
            pixKey,
            input.clientKey ?? null,
          ],
        );
        const campaignId = inserted.rows[0]?.id;
        if (!campaignId) throw new Error('campaign insert returned no id');
        await logCampaignEvent(client, {
          campaignId,
          actorId: user.id,
          actorKind: 'owner',
          action: 'created',
          after: { title, goalCents: input.goalCents, deadline: input.deadline },
        });
        return campaignId;
      });
      return reply.code(201).send({ id });
    } catch (error) {
      if (input.clientKey && isUniqueViolation(error)) {
        const replay = await pool.query<{ id: string }>(
          `SELECT id FROM campaigns WHERE owner_id = $1 AND client_key = $2`,
          [user.id, input.clientKey],
        );
        if (replay.rows[0]) return reply.code(200).send({ id: replay.rows[0].id });
      }
      throw error;
    }
  });

  app.patch('/campaigns/:id', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = parseId(request.params);
    const input = parse(campaignUpdateSchema, request.body);
    const next: Record<string, string | number> = {};
    if (input.title !== undefined) next.title = clean(input.title);
    if (input.purpose !== undefined) next.purpose = clean(input.purpose);
    if (input.pixKey !== undefined) next.pixKey = clean(input.pixKey);
    if (input.goalCents !== undefined) next.goalCents = input.goalCents;
    if (input.deadline !== undefined) next.deadline = input.deadline;
    if (
      (typeof next.title === 'string' && looksLikeAnimalSale(next.title)) ||
      (typeof next.purpose === 'string' && looksLikeAnimalSale(next.purpose))
    ) {
      throw new HttpError(400, 'Não é permitido vender animais.');
    }
    const reason = clean(input.reason);
    return withTransaction(pool, async (client) => {
      const campaign = await lockCampaign(client, id);
      assertOwner(campaign, user);
      assertNotSuspended(campaign);
      if (campaign.status !== 'active') {
        throw new HttpError(409, 'Campanha encerrada não muda mais.');
      }
      const current: Record<string, string | number> = {
        title: campaign.title,
        purpose: campaign.purpose,
        pixKey: campaign.pix_key,
        goalCents: campaign.goal_cents,
        deadline: campaign.deadline,
      };
      const before: Record<string, string | number> = {};
      const after: Record<string, string | number> = {};
      for (const [field, value] of Object.entries(next)) {
        if (current[field] === value) continue;
        before[field] = current[field] ?? '';
        after[field] = value;
      }
      if (Object.keys(after).length === 0) return { changed: false };
      await client.query(
        `UPDATE campaigns SET
           title = COALESCE($2, title),
           purpose = COALESCE($3, purpose),
           pix_key = COALESCE($4, pix_key),
           goal_cents = COALESCE($5, goal_cents),
           deadline = COALESCE($6::date, deadline),
           updated_at = now()
         WHERE id = $1`,
        [
          id,
          after.title ?? null,
          after.purpose ?? null,
          after.pixKey ?? null,
          after.goalCents ?? null,
          after.deadline ?? null,
        ],
      );
      await logCampaignEvent(client, {
        campaignId: id,
        actorId: user.id,
        actorKind: 'owner',
        action: 'edited',
        before,
        after,
        note: reason,
      });
      return { changed: true };
    });
  });

  // Lançamento do responsável: doação que ele recebeu ou despesa que pagou, com comprovante.
  app.post('/campaigns/:id/entries', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const id = parseId(request.params);
    const input = parse(campaignEntrySchema, request.body);
    const description = clean(input.description);
    const replay = await replayEntry(pool, user.id, input.clientKey);
    if (replay) return reply.code(200).send({ id: replay.id });
    await checkReceipt(user.id, input.receiptKey);
    try {
      const entryId = await withTransaction(pool, async (client) => {
        const campaign = await lockCampaign(client, id);
        assertOwner(campaign, user);
        assertNotSuspended(campaign);
        if (campaign.status !== 'active') {
          throw new HttpError(409, 'A campanha já foi encerrada com a prestação de contas.');
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO campaign_entries
             (campaign_id, kind, amount_cents, description, occurred_on, status, receipt_key,
              created_by, decided_by, decided_at, client_key)
           VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7, $7, now(), $8) RETURNING id`,
          [
            id,
            input.kind,
            input.amountCents,
            description,
            input.occurredOn,
            input.receiptKey,
            user.id,
            input.clientKey ?? null,
          ],
        );
        const newId = inserted.rows[0]?.id;
        if (!newId) throw new Error('entry insert returned no id');
        await client.query(`UPDATE campaigns SET updated_at = now() WHERE id = $1`, [id]);
        await logCampaignEvent(client, {
          campaignId: id,
          actorId: user.id,
          actorKind: 'owner',
          action: 'entry_added',
          entryId: newId,
          after: { kind: input.kind, amountCents: input.amountCents, description },
        });
        return newId;
      });
      return reply.code(201).send({ id: entryId });
    } catch (error) {
      if (input.clientKey && isUniqueViolation(error)) {
        const again = await replayEntry(pool, user.id, input.clientKey);
        if (again) return reply.code(200).send({ id: again.id });
      }
      throw error;
    }
  });

  // "Fiz um Pix": fica pendente e não soma até o responsável conferir no extrato.
  app.post('/campaigns/:id/pledges', publishLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const id = parseId(request.params);
    const input = parse(campaignPledgeSchema, request.body);
    const replay = await replayEntry(pool, user.id, input.clientKey);
    if (replay) return reply.code(200).send({ id: replay.id, status: 'pending' });
    if (input.receiptKey) await checkReceipt(user.id, input.receiptKey);
    let ownerId: string;
    let entryId: string;
    try {
      ({ ownerId, entryId } = await withTransaction(pool, async (client) => {
        const campaign = await lockCampaign(client, id);
        if (campaign.owner_id === user.id) {
          throw new HttpError(400, 'Doação que você recebeu entra como lançamento do responsável.');
        }
        const owner = await client.query<{ verified: boolean; ok: boolean }>(
          `SELECT verified, (deleted_at IS NULL AND suspended = false) AS ok FROM users WHERE id = $1`,
          [campaign.owner_id],
        );
        const phase = campaignPhase(campaign.status, campaign.deadline, belemToday());
        if (phase !== 'active' || !owner.rows[0]?.verified || !owner.rows[0]?.ok) {
          throw new HttpError(409, 'Esta campanha não está recebendo doações agora.');
        }
        const pending = await client.query<{ total: number }>(
          `SELECT count(*)::int AS total FROM campaign_entries
           WHERE campaign_id = $1 AND created_by = $2 AND status = 'pending'`,
          [id, user.id],
        );
        if ((pending.rows[0]?.total ?? 0) >= MAX_PENDING_PLEDGES) {
          throw new HttpError(
            429,
            'Você já tem avisos esperando o responsável conferir. Aguarde a resposta.',
          );
        }
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO campaign_entries
             (campaign_id, kind, amount_cents, description, occurred_on, status, receipt_key,
              created_by, show_name, client_key)
           VALUES ($1, 'donation', $2, 'Doação por Pix', $3, 'pending', $4, $5, $6, $7)
           RETURNING id`,
          [
            id,
            input.amountCents,
            input.occurredOn,
            input.receiptKey ?? null,
            user.id,
            input.showName,
            input.clientKey ?? null,
          ],
        );
        const newId = inserted.rows[0]?.id;
        if (!newId) throw new Error('pledge insert returned no id');
        await logCampaignEvent(client, {
          campaignId: id,
          actorId: user.id,
          actorKind: 'donor',
          action: 'pledge_created',
          entryId: newId,
          after: { amountCents: input.amountCents, withReceipt: Boolean(input.receiptKey) },
        });
        return { ownerId: campaign.owner_id, entryId: newId };
      }));
    } catch (error) {
      if (input.clientKey && isUniqueViolation(error)) {
        const again = await replayEntry(pool, user.id, input.clientKey);
        if (again) return reply.code(200).send({ id: again.id, status: 'pending' });
      }
      throw error;
    }
    await notifyPeople(pool, env, [ownerId], 'campaign', {
      title: 'Aviso de doação',
      body: `${firstName(user.name)} avisou que doou ${formatCents(input.amountCents)}. Confira no seu extrato e confirme na campanha.`,
      route: `/campanha/${id}`,
    }).catch(bestEffort(request, 'notify:campaign-pledge'));
    return reply.code(201).send({ id: entryId, status: 'pending' });
  });

  app.post('/campaigns/:id/entries/:entryId/confirm', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = entryParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse aviso não existe mais.');
    const { id, entryId } = parsed.data;
    const input = parse(campaignConfirmSchema, request.body ?? {});
    if (input.receiptKey) await checkReceipt(user.id, input.receiptKey);
    const result = await withTransaction(pool, async (client) => {
      const campaign = await lockCampaign(client, id);
      assertOwner(campaign, user);
      assertNotSuspended(campaign);
      const found = await client.query<{
        status: string;
        kind: string;
        amount_cents: number;
        receipt_key: string | null;
        created_by: string | null;
      }>(
        `SELECT status, kind, amount_cents, receipt_key, created_by FROM campaign_entries
         WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [entryId, id],
      );
      const entry = found.rows[0];
      if (!entry || entry.kind !== 'donation') throw new HttpError(404, 'Esse aviso não existe.');
      if (entry.status !== 'pending') throw new HttpError(409, 'Esse aviso já foi respondido.');
      const receipt = input.receiptKey ?? entry.receipt_key;
      if (!receipt) {
        throw new HttpError(
          400,
          'Anexe o comprovante do extrato: doação só conta com comprovante.',
        );
      }
      await client.query(
        `UPDATE campaign_entries
         SET status = 'confirmed', receipt_key = $2, decided_by = $3, decided_at = now()
         WHERE id = $1`,
        [entryId, receipt, user.id],
      );
      await client.query(`UPDATE campaigns SET updated_at = now() WHERE id = $1`, [id]);
      await logCampaignEvent(client, {
        campaignId: id,
        actorId: user.id,
        actorKind: 'owner',
        action: 'pledge_confirmed',
        entryId,
        before: { status: 'pending' },
        after: { status: 'confirmed', amountCents: entry.amount_cents },
      });
      return { donor: entry.created_by, amount: entry.amount_cents };
    });
    if (result.donor) {
      await notifyPeople(pool, env, [result.donor], 'campaign', {
        title: 'Doação confirmada',
        body: `O responsável confirmou a sua doação de ${formatCents(result.amount)}. Obrigado!`,
        route: `/campanha/${id}`,
      }).catch(bestEffort(request, 'notify:campaign-confirm'));
    }
    return { status: 'confirmed' };
  });

  app.post('/campaigns/:id/entries/:entryId/reject', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = entryParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse aviso não existe mais.');
    const { id, entryId } = parsed.data;
    const reason = clean(parse(campaignDecisionNoteSchema, request.body).reason);
    const result = await withTransaction(pool, async (client) => {
      const campaign = await lockCampaign(client, id);
      assertOwner(campaign, user);
      const found = await client.query<{
        status: string;
        kind: string;
        amount_cents: number;
        created_by: string | null;
      }>(
        `SELECT status, kind, amount_cents, created_by FROM campaign_entries
         WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [entryId, id],
      );
      const entry = found.rows[0];
      if (!entry || entry.kind !== 'donation') throw new HttpError(404, 'Esse aviso não existe.');
      if (entry.status !== 'pending') throw new HttpError(409, 'Esse aviso já foi respondido.');
      await client.query(
        `UPDATE campaign_entries
         SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3
         WHERE id = $1`,
        [entryId, user.id, reason],
      );
      await logCampaignEvent(client, {
        campaignId: id,
        actorId: user.id,
        actorKind: 'owner',
        action: 'pledge_rejected',
        entryId,
        before: { status: 'pending' },
        after: { status: 'rejected', amountCents: entry.amount_cents },
        note: reason,
      });
      return { donor: entry.created_by, amount: entry.amount_cents };
    });
    if (result.donor) {
      await notifyPeople(pool, env, [result.donor], 'campaign', {
        title: 'Doação não encontrada no extrato',
        body: `O responsável não achou a sua doação de ${formatCents(result.amount)}: ${reason}`,
        route: `/campanha/${id}`,
      }).catch(bestEffort(request, 'notify:campaign-reject'));
    }
    return { status: 'rejected' };
  });

  // Correção: o lançamento fica no extrato, riscado, com o motivo. Nada é apagado.
  app.post('/campaigns/:id/entries/:entryId/void', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const parsed = entryParams.safeParse(request.params);
    if (!parsed.success) throw new HttpError(404, 'Esse lançamento não existe mais.');
    const { id, entryId } = parsed.data;
    const reason = clean(parse(campaignVoidSchema, request.body).reason);
    const staff = isFinanceStaff(user);
    await withTransaction(pool, async (client) => {
      const campaign = await lockCampaign(client, id);
      const owner = campaign.owner_id === user.id;
      if (!owner && !staff) {
        throw new HttpError(403, 'Só o responsável pela campanha pode fazer isso.');
      }
      if (owner && !staff) assertNotSuspended(campaign);
      const found = await client.query<{ status: string; amount_cents: number; kind: string }>(
        `SELECT status, amount_cents, kind FROM campaign_entries
         WHERE id = $1 AND campaign_id = $2 FOR UPDATE`,
        [entryId, id],
      );
      const entry = found.rows[0];
      if (!entry) throw new HttpError(404, 'Esse lançamento não existe.');
      if (entry.status !== 'confirmed') {
        throw new HttpError(409, 'Só lançamento confirmado pode ser anulado.');
      }
      await client.query(
        `UPDATE campaign_entries
         SET status = 'voided', decided_by = $2, decided_at = now(), decision_note = $3
         WHERE id = $1`,
        [entryId, user.id, reason],
      );
      await client.query(`UPDATE campaigns SET updated_at = now() WHERE id = $1`, [id]);
      await logCampaignEvent(client, {
        campaignId: id,
        actorId: user.id,
        actorKind: owner ? 'owner' : 'staff',
        action: 'entry_voided',
        entryId,
        before: { status: 'confirmed' },
        after: { status: 'voided', amountCents: entry.amount_cents, kind: entry.kind },
        note: reason,
      });
    });
    return { status: 'voided' };
  });

  app.post('/campaigns/:id/close', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const id = parseId(request.params);
    const note = clean(parse(campaignCloseSchema, request.body).note);
    const donors = await withTransaction(pool, async (client) => {
      const campaign = await lockCampaign(client, id);
      assertOwner(campaign, user);
      assertNotSuspended(campaign);
      if (campaign.status !== 'active') throw new HttpError(409, 'A campanha já foi encerrada.');
      const pending = await client.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM campaign_entries
         WHERE campaign_id = $1 AND status = 'pending'`,
        [id],
      );
      if ((pending.rows[0]?.total ?? 0) > 0) {
        throw new HttpError(
          409,
          'Responda os avisos de doação que estão esperando antes de encerrar.',
        );
      }
      await client.query(
        `UPDATE campaigns
         SET status = 'closed', closing_note = $2, closed_at = now(), updated_at = now()
         WHERE id = $1`,
        [id, note],
      );
      await logCampaignEvent(client, {
        campaignId: id,
        actorId: user.id,
        actorKind: 'owner',
        action: 'closed',
        before: { status: 'active' },
        after: { status: 'closed' },
        note,
      });
      const people = await client.query<{ created_by: string }>(
        `SELECT DISTINCT created_by FROM campaign_entries
         WHERE campaign_id = $1 AND kind = 'donation' AND status = 'confirmed'
           AND created_by IS NOT NULL AND created_by <> $2`,
        [id, user.id],
      );
      return people.rows.map((row) => row.created_by);
    });
    await notifyPeople(pool, env, donors, 'campaign', {
      title: 'Prestação de contas publicada',
      body: 'A campanha que você ajudou foi encerrada. Veja no app como o dinheiro foi usado.',
      route: `/campanha/${id}`,
    }).catch(bestEffort(request, 'notify:campaign-closed'));
    return { status: 'closed' };
  });
}
