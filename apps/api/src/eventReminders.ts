import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Env } from './config.js';
import { belemWhen, fillOpenSpots, inTransaction } from './events.js';
import { captureServerError } from './monitoring.js';
import { notifyPeople } from './notify.js';

const queueName = 'event-reminders';
/** De quanto em quanto tempo a agenda é varrida. */
export const SWEEP_EVERY_MS = 10 * 60 * 1000;
const DAY_BEFORE_MS = 24 * 60 * 60 * 1000;
const SOON_BEFORE_MS = 2 * 60 * 60 * 1000;

/**
 * Lembretes da agenda: um na véspera (até 24 h antes) e outro perto da hora (até 2 h antes),
 * só para quem está inscrito. Em vez de um job por evento, uma varredura a cada 10 minutos:
 * mudar o horário, cancelar ou reiniciar a API não deixa lembrete perdido nem duplicado. A
 * tabela event_reminders guarda o que já saiu, com o horário do evento na chave.
 */
export async function sendEventReminders(
  pool: Pool,
  env: Env,
  now: Date = new Date(),
): Promise<number> {
  const due = await pool.query<{
    id: string;
    title: string;
    place_label: string;
    starts_at: Date;
  }>(
    `SELECT id, title, place_label, starts_at FROM adoption_events
     WHERE hidden = false AND review_status = 'published' AND cancelled_at IS NULL
       AND starts_at > $1 AND starts_at <= $2
     ORDER BY starts_at ASC
     LIMIT 200`,
    [now, new Date(now.getTime() + DAY_BEFORE_MS)],
  );
  let sent = 0;
  for (const event of due.rows) {
    const kind = event.starts_at.getTime() - now.getTime() <= SOON_BEFORE_MS ? 'soon' : 'day';
    const claimed = await pool.query(
      `INSERT INTO event_reminders (event_id, kind, starts_at) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [event.id, kind, event.starts_at],
    );
    if ((claimed.rowCount ?? 0) === 0) continue;
    const people = await pool.query<{ user_id: string; confirmed: boolean }>(
      `SELECT user_id, confirmed_at IS NOT NULL AS confirmed FROM event_registrations
       WHERE event_id = $1 AND status = 'registered'`,
      [event.id],
    );
    const when = belemWhen(event.starts_at);
    const confirmed = people.rows.filter((row) => row.confirmed).map((row) => row.user_id);
    const pending = people.rows.filter((row) => !row.confirmed).map((row) => row.user_id);
    const title = kind === 'soon' ? 'Já já começa' : 'Seu evento está chegando';
    const route = `/evento/${event.id}`;
    await notifyPeople(pool, env, confirmed, 'event_reminder', {
      title,
      body: `${event.title}: ${when}, em ${event.place_label}.`,
      route,
    });
    await notifyPeople(pool, env, pending, 'event_reminder', {
      title,
      body: `${event.title}: ${when}, em ${event.place_label}. Confirme sua presença ou libere a vaga.`,
      route,
    });
    sent += people.rows.length;
  }
  return sent;
}

/**
 * Vagas que abriram sem ninguém desistir pelo app (conta apagada, por exemplo) vão para a fila
 * de espera na próxima varredura.
 */
export async function promoteWaitlists(pool: Pool, env: Env): Promise<number> {
  const events = await pool.query<{ id: string; title: string }>(
    `SELECT e.id, e.title FROM adoption_events e
     WHERE e.cancelled_at IS NULL AND e.hidden = false AND e.ends_at > now()
       AND EXISTS (SELECT 1 FROM event_registrations r
                   WHERE r.event_id = e.id AND r.status = 'waitlist')
       AND (e.capacity IS NULL OR e.capacity > (
         SELECT count(*) FROM event_registrations r
         WHERE r.event_id = e.id AND r.status = 'registered'))
     LIMIT 100`,
  );
  let promoted = 0;
  for (const event of events.rows) {
    const people = await inTransaction(pool, async (client) => {
      await client.query(`SELECT id FROM adoption_events WHERE id = $1 FOR UPDATE`, [event.id]);
      return fillOpenSpots(client, event.id);
    });
    promoted += people.length;
    await notifyPeople(pool, env, people, 'event_spot', {
      title: 'Abriu uma vaga para você',
      body: `Você saiu da fila de espera e está inscrito em ${event.title}.`,
      route: `/evento/${event.id}`,
    });
  }
  return promoted;
}

export function startEventReminders(redis: Redis, pool: Pool, env: Env) {
  const connection = redis as unknown as ConnectionOptions;
  const queue = new Queue(queueName, { connection });
  const worker = new Worker(
    queueName,
    async () => {
      await promoteWaitlists(pool, env);
      await sendEventReminders(pool, env);
    },
    { connection },
  );
  worker.on('failed', (job, error) => {
    captureServerError(error, { where: `worker:${job?.name ?? 'event-reminders'}` });
  });
  // Um agendador só, mesmo com a API reiniciando: o id é fixo.
  void queue
    .upsertJobScheduler('agenda-sweep', { every: SWEEP_EVERY_MS }, { name: 'sweep' })
    .catch((error: unknown) => {
      captureServerError(error, { where: 'worker:event-reminders:schedule' });
    });
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
