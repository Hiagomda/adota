import {
  CHECKIN_DAYS,
  adopterSchema,
  checkinAnswerSchema,
  checkinDueAt,
  checkinNeedsAttention,
  checkinsToNotify,
  type CheckinDay,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { notifyPeople } from './notify.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/**
 * Acompanhamento depois da adoção. Quando o animal é adotado e se sabe quem é o tutor (quem
 * ajudou e decidiu adotar, ou a pessoa da ficha que quem publicou indicou), o app pergunta aos
 * 7, 30 e 90 dias como vai a adaptação. "Difícil" ou "quero orientação" avisa quem cuidava, para
 * conversarem antes de uma devolução. A conversa continua no WhatsApp.
 */

interface FollowupRow {
  id: string;
  post_id: string;
  tutor_id: string;
  responsible_id: string | null;
  adopted_at: Date;
  closed_at: Date | null;
  tutor_name: string;
  tutor_handle: string;
}

interface CheckinRow {
  day: CheckinDay;
  notified_at: Date | null;
  answered_at: Date | null;
  mood: 'great' | 'ok' | 'hard' | null;
  note: string | null;
  wants_help: boolean;
}

const idParams = z.object({ id: z.string().uuid() });
const checkinParams = z.object({
  id: z.string().uuid(),
  day: z.coerce.number().refine((value) => (CHECKIN_DAYS as readonly number[]).includes(value)),
});

function params<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'Esse acompanhamento não existe.');
  return parsed.data;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Alguém';
}

async function animalName(pool: Pool, postId: string): Promise<string> {
  const found = await pool.query<{ name: string | null; species: string }>(
    `SELECT a.name, a.species FROM posts p JOIN animals a ON a.id = p.animal_id WHERE p.id = $1`,
    [postId],
  );
  const row = found.rows[0];
  if (row?.name?.trim()) return row.name.trim();
  return row?.species === 'cat' ? 'o gato' : row?.species === 'dog' ? 'o cachorro' : 'o bichinho';
}

/**
 * Abre (ou reabre, numa nova adoção depois de devolução) o acompanhamento do post. O tutor não
 * acompanha a si mesmo: quem publicou e adotou o próprio resgate não recebe check-in.
 */
export async function startFollowup(
  pool: Pool,
  env: Env,
  postId: string,
  tutorId: string,
  responsibleId: string | null,
): Promise<boolean> {
  if (responsibleId === tutorId) return false;
  await pool.query(
    `INSERT INTO adoption_followups (post_id, tutor_id, responsible_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (post_id) DO UPDATE
       SET tutor_id = EXCLUDED.tutor_id, responsible_id = EXCLUDED.responsible_id,
           adopted_at = now(), closed_at = NULL`,
    [postId, tutorId, responsibleId],
  );
  await pool.query(
    `DELETE FROM adoption_checkins
     WHERE followup_id = (SELECT id FROM adoption_followups WHERE post_id = $1)`,
    [postId],
  );
  const name = await animalName(pool, postId);
  await notifyPeople(pool, env, [tutorId], 'adoption_followup', {
    title: 'Parabéns pela adoção!',
    body: `Daqui a 7, 30 e 90 dias vamos perguntar como ${name} está. Se precisar de ajuda antes, é só abrir o acompanhamento.`,
    postId,
    route: `/acompanhamento/${postId}`,
  });
  return true;
}

/**
 * Depois de uma mudança de status: quem ajudou e decidiu adotar vira tutor; devolução fecha o
 * acompanhamento. Quando quem publicou marca que outra pessoa adotou, ele indica o tutor depois.
 */
export async function followupAfterStatus(
  pool: Pool,
  env: Env,
  postId: string,
  user: SessionUser,
  status: string,
): Promise<void> {
  if (status === 'for_adoption') {
    await pool.query(
      `UPDATE adoption_followups SET closed_at = now() WHERE post_id = $1 AND closed_at IS NULL`,
      [postId],
    );
    return;
  }
  if (status !== 'adopted') return;
  const post = await pool.query<{ author_id: string; type: string }>(
    'SELECT author_id, type FROM posts WHERE id = $1',
    [postId],
  );
  const row = post.rows[0];
  if (!row || row.type === 'lost' || row.author_id === user.id || isOperator(user.role)) return;
  await startFollowup(pool, env, postId, user.id, row.author_id);
}

async function followupOf(pool: Pool, postId: string): Promise<FollowupRow | null> {
  const found = await pool.query<FollowupRow>(
    `SELECT f.id, f.post_id, f.tutor_id, f.responsible_id, f.adopted_at, f.closed_at,
            u.name AS tutor_name, u.handle AS tutor_handle
     FROM adoption_followups f JOIN users u ON u.id = f.tutor_id
     WHERE f.post_id = $1`,
    [postId],
  );
  return found.rows[0] ?? null;
}

export async function loadFollowup(pool: Pool, postId: string, viewer: SessionUser) {
  const post = await pool.query<{ author_id: string; status: string; type: string }>(
    `SELECT author_id, status, type FROM posts
     WHERE id = $1 AND parent_post_id IS NULL AND hidden = false`,
    [postId],
  );
  const gate = post.rows[0];
  if (!gate) throw new HttpError(404, 'Esse animal não existe.');
  const followup = await followupOf(pool, postId);
  const team = isOperator(viewer.role);
  const role =
    followup?.tutor_id === viewer.id
      ? 'tutor'
      : followup?.responsible_id === viewer.id || (!followup && gate.author_id === viewer.id)
        ? 'responsible'
        : team
          ? 'team'
          : null;
  const canSetAdopter =
    gate.status === 'adopted' &&
    gate.type !== 'lost' &&
    (gate.author_id === viewer.id || team) &&
    (!followup || followup.closed_at !== null);
  // Quem pode ser indicado: quem preencheu a ficha de adoção desse animal.
  const candidates = canSetAdopter
    ? (
        await pool.query<{ id: string; name: string; handle: string }>(
          `SELECT u.id, u.name, u.handle FROM adoption_interests i
           JOIN users u ON u.id = i.user_id
           WHERE i.post_id = $1 AND u.deleted_at IS NULL AND u.id <> $2
           ORDER BY i.updated_at DESC LIMIT 20`,
          [postId, gate.author_id],
        )
      ).rows
    : [];
  if (!followup || role === null) {
    return { role, canSetAdopter, candidates, followup: null };
  }
  const checkins = await pool.query<CheckinRow>(
    `SELECT day, notified_at, answered_at, mood, note, wants_help
     FROM adoption_checkins WHERE followup_id = $1`,
    [followup.id],
  );
  const byDay = new Map(checkins.rows.map((row) => [row.day, row]));
  const now = Date.now();
  return {
    role,
    canSetAdopter,
    candidates,
    followup: {
      id: followup.id,
      adoptedAt: followup.adopted_at.toISOString(),
      closed: followup.closed_at !== null,
      tutor: { name: followup.tutor_name, handle: followup.tutor_handle },
      checkins: CHECKIN_DAYS.map((day) => {
        const row = byDay.get(day);
        const dueAt = checkinDueAt(followup.adopted_at, day);
        return {
          day,
          dueAt: dueAt.toISOString(),
          due: dueAt.getTime() <= now,
          answeredAt: row?.answered_at?.toISOString() ?? null,
          mood: row?.mood ?? null,
          note: row?.note ?? null,
          wantsHelp: row?.wants_help ?? false,
        };
      }),
    },
  };
}

/** Varredura: avisa o tutor de cada check-in que chegou, uma vez só. */
export async function sendAdoptionCheckins(
  pool: Pool,
  env: Env,
  now: Date = new Date(),
): Promise<number> {
  const open = await pool.query<{
    id: string;
    post_id: string;
    tutor_id: string;
    adopted_at: Date;
  }>(
    `SELECT id, post_id, tutor_id, adopted_at FROM adoption_followups
     WHERE closed_at IS NULL AND adopted_at <= $1::timestamptz - interval '7 days'
       AND adopted_at > $1::timestamptz - interval '104 days'
     LIMIT 500`,
    [now],
  );
  let sent = 0;
  for (const followup of open.rows) {
    for (const day of checkinsToNotify(followup.adopted_at, now)) {
      const claimed = await pool.query(
        `INSERT INTO adoption_checkins (followup_id, day, notified_at) VALUES ($1, $2, $3)
         ON CONFLICT (followup_id, day) DO NOTHING`,
        [followup.id, day, now],
      );
      if ((claimed.rowCount ?? 0) === 0) continue;
      const name = await animalName(pool, followup.post_id);
      await notifyPeople(pool, env, [followup.tutor_id], 'adoption_checkin', {
        title:
          day === 7 ? 'Uma semana juntos!' : day === 30 ? 'Um mês juntos!' : 'Três meses juntos!',
        body: `Como ${name} está se adaptando? Conte em poucos toques.`,
        postId: followup.post_id,
        route: `/acompanhamento/${followup.post_id}`,
      });
      sent += 1;
    }
  }
  return sent;
}

export function registerFollowupRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; contactLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, contactLimit } = deps;

  app.get('/posts/:id/followup', async (request) => {
    const user = requireUser(request.user);
    const { id } = params(idParams, request.params);
    return loadFollowup(pool, id, user);
  });

  // Quem publicou indica quem adotou, entre quem preencheu a ficha.
  app.post('/posts/:id/adopter', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const { id } = params(idParams, request.params);
    const body = adopterSchema.safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'Escolha quem adotou.');
    const state = await loadFollowup(pool, id, user);
    if (!state.canSetAdopter) {
      throw new HttpError(403, 'Só quem publicou indica quem adotou, depois de marcar Adotado.');
    }
    if (!state.candidates.some((person) => person.id === body.data.userId)) {
      throw new HttpError(400, 'Escolha alguém que preencheu a ficha de adoção desse animal.');
    }
    const author = await pool.query<{ author_id: string }>(
      'SELECT author_id FROM posts WHERE id = $1',
      [id],
    );
    await startFollowup(pool, env, id, body.data.userId, author.rows[0]?.author_id ?? user.id);
    return loadFollowup(pool, id, user);
  });

  app.post('/adoption-followups/:id/checkins/:day', writeLimit, async (request) => {
    const user = requireUser(request.user);
    const { id, day } = params(checkinParams, request.params);
    const body = checkinAnswerSchema.safeParse(request.body);
    if (!body.success) throw new HttpError(400, 'Escolha como está a adaptação.');
    const found = await pool.query<FollowupRow>(
      `SELECT f.id, f.post_id, f.tutor_id, f.responsible_id, f.adopted_at, f.closed_at,
              u.name AS tutor_name, u.handle AS tutor_handle
       FROM adoption_followups f JOIN users u ON u.id = f.tutor_id WHERE f.id = $1`,
      [id],
    );
    const followup = found.rows[0];
    if (!followup || followup.tutor_id !== user.id) {
      throw new HttpError(404, 'Esse acompanhamento não existe.');
    }
    if (followup.closed_at) throw new HttpError(400, 'Esse acompanhamento foi encerrado.');
    if (checkinDueAt(followup.adopted_at, day as CheckinDay).getTime() > Date.now()) {
      throw new HttpError(400, 'Esse check-in ainda não chegou.');
    }
    const note = body.data.note ? stripControls(body.data.note).trim() || null : null;
    const before = await pool.query<{ answered_at: Date | null }>(
      'SELECT answered_at FROM adoption_checkins WHERE followup_id = $1 AND day = $2',
      [id, day],
    );
    await pool.query(
      `INSERT INTO adoption_checkins (followup_id, day, answered_at, mood, note, wants_help)
       VALUES ($1, $2, now(), $3, $4, $5)
       ON CONFLICT (followup_id, day) DO UPDATE
         SET answered_at = now(), mood = EXCLUDED.mood, note = EXCLUDED.note,
             wants_help = EXCLUDED.wants_help`,
      [id, day, body.data.mood, note, body.data.wantsHelp],
    );
    const firstAnswer = !before.rows[0]?.answered_at;
    if (followup.responsible_id && (checkinNeedsAttention(body.data) || firstAnswer)) {
      const name = await animalName(pool, followup.post_id);
      const attention = checkinNeedsAttention(body.data);
      await notifyPeople(pool, env, [followup.responsible_id], 'adoption_checkin_answer', {
        title: attention ? 'A adaptação precisa de atenção' : 'Notícias da adoção',
        body: attention
          ? `${firstName(followup.tutor_name)} contou que está difícil com ${name}${body.data.wantsHelp ? ' e pediu orientação' : ''}. Converse antes de uma devolução.`
          : `${firstName(followup.tutor_name)} contou como ${name} está depois de ${day} dias.`,
        postId: followup.post_id,
        route: `/acompanhamento/${followup.post_id}`,
      });
    }
    return loadFollowup(pool, followup.post_id, user);
  });

  // Quem cuidava fala com o tutor pelo WhatsApp, se ele liberou o número.
  app.post('/adoption-followups/:id/contact', contactLimit, async (request) => {
    const user = requireUser(request.user);
    const { id } = params(idParams, request.params);
    const found = await pool.query<{
      responsible_id: string | null;
      phone: string | null;
      whatsapp_opt_in: boolean;
    }>(
      `SELECT f.responsible_id, u.phone, u.whatsapp_opt_in
       FROM adoption_followups f JOIN users u ON u.id = f.tutor_id WHERE f.id = $1`,
      [id],
    );
    const row = found.rows[0];
    if (!row || (row.responsible_id !== user.id && !isOperator(user.role))) {
      throw new HttpError(404, 'Esse acompanhamento não existe.');
    }
    if (!row.whatsapp_opt_in || !row.phone) {
      throw new HttpError(404, 'O tutor ainda não liberou o WhatsApp.');
    }
    return { phone: row.phone };
  });
}
