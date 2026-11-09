import {
  TERM_FIELDS,
  defaultTermTemplate,
  fillTerm,
  formatCpf,
  orgTermSchema,
  termAcceptSchema,
  type TermAnimal,
} from '@patinha/shared';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { isOperator, requireUser } from './authz.js';
import type { Env } from './config.js';
import { HttpError } from './http.js';
import { canUseNgoPanel } from './ngoPanel.js';
import { notifyPeople } from './notify.js';
import type { SessionUser } from './session.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/**
 * Termo de adoção responsável. Vale o termo de quem entrega (ONG ou protetor verificado que
 * escreveu o próprio no painel) ou o termo do app. Quem adota aceita na tela do acompanhamento,
 * depois que o animal é marcado como adotado; o texto aceito fica guardado como foi lido, com o
 * nome completo (e CPF e endereço, se a ONG pedir). Só quem adotou, quem entregou e a equipe
 * veem o aceite.
 */

const idParams = z.object({ id: z.string().uuid() });

function postIdOf(params: unknown): string {
  const parsed = idParams.safeParse(params);
  if (!parsed.success) throw new HttpError(404, 'Esse animal não existe mais.');
  return parsed.data.id;
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, value: unknown): z.output<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find(
    (issue) =>
      issue.code === z.ZodIssueCode.custom || issue.code === z.ZodIssueCode.invalid_literal,
  );
  throw new HttpError(400, custom?.message ?? 'Confira os dados e tente de novo.');
}

interface GiverRow {
  post_id: string;
  author_id: string;
  status: string;
  type: string;
  author_name: string;
  role: string;
  verified: boolean;
  organization_name: string | null;
  org_body: string | null;
  require_identity: boolean | null;
  animal_name: string | null;
  species: string;
  sex: string | null;
  neutered: boolean | null;
}

interface FollowupRow {
  tutor_id: string;
  responsible_id: string | null;
  adopted_at: Date;
  closed_at: Date | null;
}

interface AcceptedRow {
  body: string;
  source: 'app' | 'org';
  giver_name: string | null;
  full_name: string | null;
  cpf: string | null;
  address: string | null;
  accepted_at: Date;
  name: string;
  handle: string;
}

/** O termo que vale para este animal, sem o nome de quem adota. */
async function termFor(pool: Pool, postId: string) {
  const found = await pool.query<GiverRow>(
    `SELECT p.id AS post_id, p.author_id, p.status, p.type, u.name AS author_name, u.role,
            u.verified, v.organization_name, o.body AS org_body, o.require_identity,
            a.name AS animal_name, a.species, a.sex, a.neutered
     FROM posts p
     JOIN users u ON u.id = p.author_id
     JOIN animals a ON a.id = p.animal_id
     LEFT JOIN LATERAL (
       SELECT organization_name FROM verification_requests
       WHERE user_id = u.id AND status = 'approved'
       ORDER BY decided_at DESC NULLS LAST, created_at DESC LIMIT 1
     ) v ON true
     LEFT JOIN org_adoption_terms o ON o.user_id = u.id
     WHERE p.id = $1 AND p.parent_post_id IS NULL AND p.hidden = false`,
    [postId],
  );
  const row = found.rows[0];
  if (!row || row.type === 'lost') throw new HttpError(404, 'Esse animal não existe mais.');
  const org = row.verified && (row.role === 'ngo' || row.role === 'protector');
  const useOrg = org && Boolean(row.org_body);
  const animal: TermAnimal = {
    name: row.animal_name,
    species: row.species,
    sex: row.sex,
    neutered: row.neutered,
  };
  return {
    row,
    animal,
    source: useOrg ? ('org' as const) : ('app' as const),
    giverName: (org && row.organization_name?.trim()) || row.author_name,
    template: useOrg && row.org_body ? row.org_body : defaultTermTemplate(animal),
    requireIdentity: useOrg && row.require_identity === true,
  };
}

async function followupOf(pool: Pool, postId: string): Promise<FollowupRow | null> {
  const found = await pool.query<FollowupRow>(
    `SELECT tutor_id, responsible_id, adopted_at, closed_at FROM adoption_followups
     WHERE post_id = $1`,
    [postId],
  );
  return found.rows[0] ?? null;
}

/** O aceite desta adoção: do tutor atual, feito depois da adoção (uma devolução zera). */
async function acceptedOf(
  pool: Pool,
  postId: string,
  followup: FollowupRow | null,
): Promise<AcceptedRow | null> {
  if (!followup) return null;
  const found = await pool.query<AcceptedRow>(
    `SELECT t.body, t.source, t.giver_name, t.full_name, t.cpf, t.address, t.accepted_at,
            u.name, u.handle
     FROM adoption_terms t JOIN users u ON u.id = t.user_id
     WHERE t.post_id = $1 AND t.user_id = $2 AND t.accepted_at >= $3`,
    [postId, followup.tutor_id, followup.adopted_at],
  );
  return found.rows[0] ?? null;
}

export async function loadAdoptionTerm(pool: Pool, postId: string, viewer: SessionUser) {
  const term = await termFor(pool, postId);
  const followup = await followupOf(pool, postId);
  const team = isOperator(viewer.role);
  const role =
    followup?.tutor_id === viewer.id
      ? 'tutor'
      : followup && (followup.responsible_id === viewer.id || term.row.author_id === viewer.id)
        ? 'responsible'
        : team && followup
          ? 'team'
          : null;
  const accepted = role ? await acceptedOf(pool, postId, followup) : null;
  const canAccept =
    role === 'tutor' && !accepted && followup?.closed_at === null && term.row.status === 'adopted';
  const text = accepted
    ? accepted.body
    : fillTerm(term.template, {
        adopter: null,
        giver: term.giverName,
        animal: term.animal,
        date: new Date(),
      });
  return {
    source: accepted?.source ?? term.source,
    giverName: accepted?.giver_name ?? term.giverName,
    requireIdentity: term.requireIdentity,
    role,
    canAccept,
    /** Quem entregou ainda espera o aceite. */
    waiting: role !== null && role !== 'tutor' && !accepted && followup?.closed_at === null,
    text,
    accepted: accepted
      ? {
          fullName: accepted.full_name ?? accepted.name,
          cpf: accepted.cpf ? formatCpf(accepted.cpf) : null,
          address: accepted.address,
          acceptedAt: accepted.accepted_at.toISOString(),
          person: { name: accepted.name, handle: accepted.handle },
        }
      : null,
  };
}

export function registerAdoptionTermRoutes(
  app: FastifyInstance,
  deps: { env: Env; pool: Pool; writeLimit: RouteLimit; strictLimit: RouteLimit },
): void {
  const { env, pool, writeLimit, strictLimit } = deps;

  // O termo que vale para o animal. Antes da adoção serve de prévia para quem preenche a ficha.
  app.get('/posts/:id/adoption-term', async (request) => {
    const user = requireUser(request.user);
    return loadAdoptionTerm(pool, postIdOf(request.params), user);
  });

  // Quem adotou aceita. O texto é montado de novo aqui, com o nome digitado, e guardado assim.
  app.post('/posts/:id/adoption-term', strictLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const postId = postIdOf(request.params);
    const input = parse(termAcceptSchema, request.body);
    const term = await termFor(pool, postId);
    const followup = await followupOf(pool, postId);
    if (
      !followup ||
      followup.tutor_id !== user.id ||
      followup.closed_at !== null ||
      term.row.status !== 'adopted'
    ) {
      throw new HttpError(403, 'Só quem adotou aceita o termo, depois que o animal é marcado.');
    }
    if (await acceptedOf(pool, postId, followup)) {
      throw new HttpError(409, 'Você já aceitou esse termo.');
    }
    const fullName = stripControls(input.fullName).replace(/\s+/g, ' ').trim();
    const cpf = input.cpf ? input.cpf.replace(/\D/g, '') : null;
    const address = input.address ? stripControls(input.address).trim() || null : null;
    if (term.requireIdentity && (!cpf || !address)) {
      throw new HttpError(400, `${term.giverName} pede CPF e endereço no termo.`);
    }
    const body = fillTerm(term.template, {
      adopter: fullName,
      giver: term.giverName,
      animal: term.animal,
      date: new Date(),
    });
    await pool.query(
      `INSERT INTO adoption_terms
         (post_id, user_id, body, source, giver_id, giver_name, full_name, cpf, address, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (post_id, user_id) DO UPDATE SET
         body = EXCLUDED.body, source = EXCLUDED.source, giver_id = EXCLUDED.giver_id,
         giver_name = EXCLUDED.giver_name, full_name = EXCLUDED.full_name, cpf = EXCLUDED.cpf,
         address = EXCLUDED.address, accepted_at = now()`,
      [
        postId,
        user.id,
        body,
        term.source,
        term.row.author_id,
        term.giverName,
        fullName,
        cpf,
        address,
      ],
    );
    const responsible = followup.responsible_id ?? term.row.author_id;
    if (responsible !== user.id) {
      const animal = term.animal.name?.trim() || 'o animal';
      await notifyPeople(pool, env, [responsible], 'adoption_term', {
        title: 'Termo de adoção aceito',
        body: `${fullName.split(' ')[0]} leu e aceitou o termo de adoção de ${animal}.`,
        postId,
        route: `/acompanhamento/${postId}`,
      }).catch((error: unknown) => {
        request.log.error({ err: error, where: 'notify:adoption-term' }, 'best-effort');
      });
    }
    return reply.code(201).send(await loadAdoptionTerm(pool, postId, user));
  });

  function requireOrg(user: SessionUser | null): SessionUser {
    const owner = requireUser(user);
    if (!canUseNgoPanel(owner)) {
      throw new HttpError(403, 'O termo próprio é das ONGs e protetores verificados.');
    }
    return owner;
  }

  // O termo da ONG, para editar no painel. Sem termo próprio, vale o do app.
  app.get('/me/adoption-term', async (request) => {
    const owner = requireOrg(request.user);
    const found = await pool.query<{ body: string; require_identity: boolean; updated_at: Date }>(
      `SELECT body, require_identity, updated_at FROM org_adoption_terms WHERE user_id = $1`,
      [owner.id],
    );
    const row = found.rows[0];
    return {
      body: row?.body ?? null,
      requireIdentity: row?.require_identity ?? false,
      updatedAt: row?.updated_at.toISOString() ?? null,
      appTemplate: defaultTermTemplate({ species: 'other', neutered: null }),
      fields: TERM_FIELDS,
    };
  });

  app.put('/me/adoption-term', writeLimit, async (request) => {
    const owner = requireOrg(request.user);
    const input = orgTermSchema.safeParse(request.body);
    if (!input.success) {
      throw new HttpError(400, 'O termo precisa ter entre 200 e 8.000 letras.');
    }
    const body = input.data.body === null ? null : stripControls(input.data.body).trim();
    if (body === null) {
      await pool.query(`DELETE FROM org_adoption_terms WHERE user_id = $1`, [owner.id]);
      return { body: null, requireIdentity: false };
    }
    if (body.length < 200) throw new HttpError(400, 'O termo precisa ter pelo menos 200 letras.');
    await pool.query(
      `INSERT INTO org_adoption_terms (user_id, body, require_identity, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET body = EXCLUDED.body, require_identity = EXCLUDED.require_identity, updated_at = now()`,
      [owner.id, body, input.data.requireIdentity],
    );
    return { body, requireIdentity: input.data.requireIdentity };
  });
}
