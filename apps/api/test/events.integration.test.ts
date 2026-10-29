import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../scripts/migrate.js';
import { buildApp } from '../src/app.js';
import { loadEnv } from '../src/config.js';
import { promoteWaitlists, sendEventReminders } from '../src/eventReminders.js';

const env = loadEnv({ ...process.env, NODE_ENV: 'test', AUTH_DEV_MODE: 'true' });
const pool = new Pool({ connectionString: env.DATABASE_URL });
const auth = (email: string) => ({ authorization: `Bearer dev:${email}` });
const HOUR = 3_600_000;

async function insertUser(
  email: string,
  handle: string,
  role = 'user',
  verified = false,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (firebase_uid, name, handle, role, verified, city)
     VALUES ($1, $2, $2, $3, $4, 'Belém') RETURNING id`,
    [`dev:${email}`, handle, role, verified],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('user insert failed');
  return id;
}

/** Sessão do painel sem passar pelo login: o token vai direto para a tabela, como o login faz. */
async function staffToken(userId: string): Promise<string> {
  const token = `adm.teste-${userId}`;
  await pool.query(
    `INSERT INTO admin_sessions (user_id, token_hash, csrf_hash, expires_at, idle_expires_at)
     VALUES ($1, $2, 'x', now() + interval '1 hour', now() + interval '30 minutes')`,
    [userId, createHash('sha256').update(token).digest('hex')],
  );
  return token;
}

function belem(offsetHours: number, durationHours = 3) {
  const starts = new Date(Date.now() + offsetHours * HOUR);
  starts.setUTCMinutes(0, 0, 0);
  const ends = new Date(starts.getTime() + durationHours * HOUR);
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString() };
}

function event(extra: Record<string, unknown> = {}) {
  return {
    title: 'Mutirão de castração no Guamá',
    category: 'neutering',
    placeLabel: 'Praça do Guamá · Guamá · Belém',
    latitude: -1.4689,
    longitude: -48.4711,
    capacity: 2,
    needs: ['volunteers', 'vets'],
    ...belem(72),
    ...extra,
  };
}

describe('agenda de eventos e mutirões', () => {
  let app: FastifyInstance;

  const create = (email: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/events', headers: auth(email), payload });
  const register = (email: string, id: string) =>
    app.inject({
      method: 'POST',
      url: `/events/${id}/registrations`,
      headers: auth(email),
      payload: {},
    });
  const detail = (id: string, email?: string) =>
    app.inject({ method: 'GET', url: `/events/${id}`, headers: email ? auth(email) : {} });

  beforeAll(async () => {
    await migrate(pool);
    app = await buildApp({ env });
  });

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE
        event_reports, event_reminders, event_changes, event_registrations, adoption_events,
        audit_events, admin_sessions, notifications, users
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('controla as vagas no servidor, com fila de espera e promoção ao desistir', async () => {
    await insertUser('ong@egua.local', 'ong', 'ngo', true);
    const people = ['ana', 'bia', 'caio', 'davi'];
    for (const name of people) await insertUser(`${name}@egua.local`, name);

    const created = await create('ong@egua.local', event());
    expect(created.statusCode).toBe(201);
    expect(created.json().reviewStatus).toBe('published');
    const id = created.json().id as string;

    // Três inscrições ao mesmo tempo para duas vagas: o servidor decide, sem passar do limite.
    const results = await Promise.all(
      ['ana', 'bia', 'caio'].map((n) => register(`${n}@egua.local`, id)),
    );
    const statuses = results.map((r) => r.json().status).sort();
    expect(statuses).toEqual(['registered', 'registered', 'waitlist']);

    const waiting = people.slice(0, 3).find((_, i) => results[i]?.json().status === 'waitlist');
    expect(waiting).toBeDefined();
    const waitingView = (await detail(id, `${waiting}@egua.local`)).json().event;
    expect(waitingView.registration).toMatchObject({ status: 'waitlist', position: 1 });
    expect(waitingView.spotsLeft).toBe(0);

    // Repetir o pedido não cria outra inscrição.
    const again = await register('ana@egua.local', id);
    expect([200, 201]).toContain(again.statusCode);
    const count = await pool.query(`SELECT count(*)::int AS n FROM event_registrations`);
    expect(count.rows[0].n).toBe(3);

    // Quem estava inscrito desiste: a vaga vai para a fila e a pessoa recebe aviso.
    const leaver = people.slice(0, 3).find((_, i) => results[i]?.json().status === 'registered');
    const left = await app.inject({
      method: 'DELETE',
      url: `/events/${id}/registrations/me`,
      headers: auth(`${leaver}@egua.local`),
    });
    expect(left.statusCode).toBe(200);
    const promoted = (await detail(id, `${waiting}@egua.local`)).json().event;
    expect(promoted.registration.status).toBe('registered');
    const notice = await pool.query(
      `SELECT n.payload FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.handle = $1 AND n.type = 'event_spot'`,
      [waiting],
    );
    expect(notice.rows[0]?.payload.route).toBe(`/evento/${id}`);

    // O limite não pode ficar abaixo de quem já está inscrito.
    const shrink = await app.inject({
      method: 'PATCH',
      url: `/events/${id}`,
      headers: auth('ong@egua.local'),
      payload: { version: promoted.version, capacity: 1 },
    });
    expect(shrink.statusCode).toBe(400);

    // Quem organiza vê a lista; quem participa, não.
    const list = await app.inject({
      method: 'GET',
      url: `/events/${id}/participants`,
      headers: auth('ong@egua.local'),
    });
    expect(list.json().participants).toHaveLength(2);
    expect(list.json().participants[0].person).not.toHaveProperty('phone');
    const denied = await app.inject({
      method: 'GET',
      url: `/events/${id}/participants`,
      headers: auth('davi@egua.local'),
    });
    expect(denied.statusCode).toBe(403);
  });

  it('avisa inscritos quando muda o horário e recusa edição com versão velha', async () => {
    await insertUser('ong@egua.local', 'ong', 'ngo', true);
    await insertUser('ana@egua.local', 'ana');
    const id = (await create('ong@egua.local', event({ capacity: null }))).json().id as string;
    await register('ana@egua.local', id);

    const moved = belem(96);
    const changed = await app.inject({
      method: 'PATCH',
      url: `/events/${id}`,
      headers: auth('ong@egua.local'),
      payload: { version: 1, ...moved },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().changed).toEqual(['startsAt', 'endsAt']);
    expect(changed.json().event.version).toBe(2);

    const stale = await app.inject({
      method: 'PATCH',
      url: `/events/${id}`,
      headers: auth('ong@egua.local'),
      payload: { version: 1, title: 'Outro título' },
    });
    expect(stale.statusCode).toBe(409);

    const notices = await pool.query(
      `SELECT type FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.handle = 'ana'`,
    );
    expect(notices.rows.map((row) => row.type)).toEqual(['event_changed']);

    const history = (await detail(id)).json().history;
    expect(history.map((item: { kind: string }) => item.kind)).toEqual(['updated', 'created']);
    expect([...history[0].fields].sort()).toEqual(['endsAt', 'startsAt']);

    // Cancelar avisa com o motivo, e o evento continua visível como cancelado.
    const cancelled = await app.inject({
      method: 'POST',
      url: `/events/${id}/cancel`,
      headers: auth('ong@egua.local'),
      payload: { reason: 'Chuva forte prevista' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().event.state).toBe('cancelled');
    const after = await register('ana@egua.local', id);
    expect(after.statusCode).toBe(409);
    const cancelNotice = await pool.query(
      `SELECT payload FROM notifications WHERE type = 'event_cancelled'`,
    );
    expect(cancelNotice.rows[0]?.payload.body).toContain('Chuva forte prevista');
  });

  it('manda evento de quem não tem selo para a equipe e só mostra depois de aprovado', async () => {
    await insertUser('vizinha@egua.local', 'vizinha');
    const modId = await insertUser('mod@egua.local', 'mod', 'moderator');
    await insertUser('ana@egua.local', 'ana');

    const fair = await create('vizinha@egua.local', event({ category: 'adoption_fair' }));
    expect(fair.statusCode).toBe(403);

    const created = await create(
      'vizinha@egua.local',
      event({
        category: 'community',
        title: 'Distribuição de ração no Jurunas',
        clientKey: 'abc12345',
      }),
    );
    expect(created.statusCode).toBe(201);
    expect(created.json().reviewStatus).toBe('pending');
    const id = created.json().id as string;

    // Reenvio depois de cair a internet devolve o mesmo evento.
    const repeated = await create(
      'vizinha@egua.local',
      event({
        category: 'community',
        title: 'Distribuição de ração no Jurunas',
        clientKey: 'abc12345',
      }),
    );
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().id).toBe(id);

    expect((await detail(id)).statusCode).toBe(404);
    expect((await register('ana@egua.local', id)).statusCode).toBe(404);
    const mine = await app.inject({
      method: 'GET',
      url: '/events?mine=organizing',
      headers: auth('vizinha@egua.local'),
    });
    expect(mine.json().events[0].reviewStatus).toBe('pending');
    expect((await app.inject({ method: 'GET', url: '/events' })).json().events).toEqual([]);

    const token = await staffToken(modId);
    const pending = await app.inject({
      method: 'GET',
      url: '/admin/v1/events?filter=pending',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pending.json().events.map((item: { id: string }) => item.id)).toEqual([id]);

    const noReason = await app.inject({
      method: 'POST',
      url: `/admin/v1/events/${id}/review`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'reject' },
    });
    expect(noReason.statusCode).toBe(400);

    const approved = await app.inject({
      method: 'POST',
      url: `/admin/v1/events/${id}/review`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'approve' },
    });
    expect(approved.statusCode).toBe(200);
    const listed = (await app.inject({ method: 'GET', url: '/events?category=community' })).json();
    expect(listed.events).toHaveLength(1);
    expect((await register('ana@egua.local', id)).statusCode).toBe(201);
    const audit = await pool.query(`SELECT action FROM audit_events WHERE target_id = $1`, [id]);
    expect(audit.rows.map((row) => row.action)).toEqual(['event.review_approve']);

    // Denúncia aparece no painel; esconder resolve e tira da agenda.
    const report = await app.inject({
      method: 'POST',
      url: `/events/${id}/report`,
      headers: auth('ana@egua.local'),
      payload: { reason: 'Estão vendendo filhote' },
    });
    expect(report.statusCode).toBe(201);
    const reported = await app.inject({
      method: 'GET',
      url: '/admin/v1/events?filter=reported',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reported.json().events[0].openReports).toBe(1);
    await app.inject({
      method: 'POST',
      url: `/admin/v1/events/${id}/visibility`,
      headers: { authorization: `Bearer ${token}` },
      payload: { hidden: true, justification: 'Denúncia de venda confirmada.' },
    });
    expect((await app.inject({ method: 'GET', url: '/events' })).json().events).toEqual([]);
  });

  it('filtra por categoria, região, distância e mês no fuso de Belém', async () => {
    await insertUser('ong@egua.local', 'ong', 'ngo', true);
    await create('ong@egua.local', event());
    await create(
      'ong@egua.local',
      event({
        category: 'vaccination',
        title: 'Vacinação antirrábica no Marco',
        placeLabel: 'Praça Brasil · Umarizal · Belém',
        latitude: -1.4421,
        longitude: -48.4806,
        ...belem(30),
      }),
    );
    const all = (await app.inject({ method: 'GET', url: '/events' })).json().events;
    expect(all.map((item: { category: string }) => item.category)).toEqual([
      'vaccination',
      'neutering',
    ]);

    const region = (await app.inject({ method: 'GET', url: '/events?neighborhood=guamá' })).json();
    expect(region.events).toHaveLength(1);
    const regions = (await app.inject({ method: 'GET', url: '/events/regions' })).json().regions;
    expect(regions.map((item: { neighborhood: string }) => item.neighborhood).sort()).toEqual([
      'Guamá',
      'Umarizal',
    ]);

    const near = (
      await app.inject({
        method: 'GET',
        url: '/events?latitude=-1.4421&longitude=-48.4806&radiusKm=1',
      })
    ).json().events;
    expect(near).toHaveLength(1);
    expect(near[0].distanceKm).toBe(0);

    const starts = new Date(all[0].startsAt);
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Belem',
      year: 'numeric',
      month: '2-digit',
    }).format(starts);
    const byMonth = (await app.inject({ method: 'GET', url: `/events?month=${month}` })).json();
    expect(byMonth.events.length).toBeGreaterThanOrEqual(1);

    // A rota antiga das feiras mostra só feira de adoção.
    expect((await app.inject({ method: 'GET', url: '/adoption-events' })).json().events).toEqual(
      [],
    );
  });

  it('lembra os inscritos uma vez por horário e registra o resultado', async () => {
    await insertUser('ong@egua.local', 'ong', 'ngo', true);
    await insertUser('ana@egua.local', 'ana');
    await insertUser('bia@egua.local', 'bia');
    const id = (await create('ong@egua.local', event({ ...belem(20), capacity: 1 }))).json()
      .id as string;
    await register('ana@egua.local', id);
    await register('bia@egua.local', id);

    expect(await sendEventReminders(pool, env)).toBe(1);
    expect(await sendEventReminders(pool, env)).toBe(0);
    const reminders = await pool.query(
      `SELECT u.handle, n.payload FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE n.type = 'event_reminder'`,
    );
    expect(reminders.rows.map((row) => row.handle)).toEqual(['ana']);
    expect(reminders.rows[0]?.payload.body).toContain('Confirme sua presença');

    // Perto da hora sai o segundo lembrete.
    expect(await sendEventReminders(pool, env, new Date(Date.now() + 19 * HOUR))).toBe(1);

    // Conta apagada libera a vaga: a varredura passa a fila adiante.
    await pool.query(
      `DELETE FROM event_registrations WHERE user_id = (SELECT id FROM users WHERE handle = 'ana')`,
    );
    expect(await promoteWaitlists(pool, env)).toBe(1);

    const confirm = await app.inject({
      method: 'POST',
      url: `/events/${id}/registrations/me/confirm`,
      headers: auth('bia@egua.local'),
    });
    expect(confirm.json().event.registration.confirmedAt).not.toBeNull();

    // Resultado só depois de começar.
    const early = await app.inject({
      method: 'POST',
      url: `/events/${id}/result`,
      headers: auth('ong@egua.local'),
      payload: { summary: 'Foi ótimo', adoptions: 3 },
    });
    expect(early.statusCode).toBe(409);
    await pool.query(
      `UPDATE adoption_events SET starts_at = now() - interval '4 hours', ends_at = now() - interval '1 hour'
       WHERE id = $1`,
      [id],
    );
    const biaId = (await pool.query(`SELECT id FROM users WHERE handle = 'bia'`)).rows[0].id;
    const attended = await app.inject({
      method: 'POST',
      url: `/events/${id}/participants/${biaId}/attendance`,
      headers: auth('ong@egua.local'),
      payload: { attended: true },
    });
    expect(attended.statusCode).toBe(200);
    const result = await app.inject({
      method: 'POST',
      url: `/events/${id}/result`,
      headers: auth('ong@egua.local'),
      payload: { summary: '32 animais castrados e 3 adoções', adoptions: 3, animalsServed: 32 },
    });
    expect(result.json().event.result).toMatchObject({
      adoptions: 3,
      animalsServed: 32,
      attended: 1,
    });
    const past = (await app.inject({ method: 'GET', url: '/events?period=past' })).json().events;
    expect(past[0].state).toBe('finished');
  });
});
