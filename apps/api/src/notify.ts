import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Env } from './config.js';
import { ensureFirebaseApp } from './firebaseAdmin.js';
import { rowsOf } from './session.js';

const queueName = 'rescue-alerts';

interface RescueJob {
  postId: string;
  expanded?: boolean;
}

export function createQueue(redis: Redis): Queue<RescueJob> {
  return new Queue<RescueJob>(queueName, { connection: redis as unknown as ConnectionOptions });
}

export function startWorker(redis: Redis, pool: Pool, env: Env): Worker<RescueJob> {
  return new Worker<RescueJob>(
    queueName,
    async (job) => {
      if (job.name === 'expand') {
        await expandRescueAlert(pool, env, job.data.postId);
        return;
      }
      await dispatchRescueAlert(pool, env, job.data.postId, job.data.expanded ? 1.5 : 1);
    },
    { connection: redis as unknown as ConnectionOptions },
  );
}

export async function enqueueRescueAlert(
  queue: Queue<RescueJob>,
  postId: string,
  urgency: 'high' | 'medium' | 'low',
): Promise<void> {
  await queue.add(
    'dispatch',
    { postId },
    { priority: urgency === 'high' ? 1 : 5, removeOnComplete: 100 },
  );
  await queue.add(
    'expand',
    { postId, expanded: true },
    { delay: 45 * 60 * 1000, jobId: `expand-${postId}` },
  );
}

export async function dispatchRescueAlert(
  pool: Pool,
  env: Env,
  postId: string,
  radiusFactor = 1,
): Promise<void> {
  const post = await pool.query<{
    id: string;
    author_id: string;
    urgency: string;
    description: string;
    approx_label: string;
  }>(
    `SELECT id, author_id, urgency, description, approx_label FROM posts
     WHERE id = $1 AND type = 'rescue_alert' AND review_status = 'published' AND hidden = false`,
    [postId],
  );
  const alert = post.rows[0];
  if (!alert) return;
  const targets = await pool.query<{
    id: string;
    fcm_tokens: string[];
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
    recent: number;
  }>(
    `SELECT u.id, u.fcm_tokens, u.quiet_hours_start, u.quiet_hours_end,
            (SELECT count(*)::int FROM notifications n
             WHERE n.user_id = u.id AND n.type = 'rescue_alert' AND n.created_at > now() - interval '1 hour') AS recent
     FROM users u
     WHERE u.deleted_at IS NULL
       AND u.suspended = false
       AND u.notifications_enabled = true
       AND u.id <> $2
       AND u.role IN ('protector', 'ngo', 'admin')
       AND u.base_location IS NOT NULL
       AND ST_DWithin(u.base_location, (SELECT location FROM posts WHERE id = $1), u.alert_radius_km * 1000 * $3)
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id)
       )
     UNION
     SELECT u.id, u.fcm_tokens, u.quiet_hours_start, u.quiet_hours_end,
            (SELECT count(*)::int FROM notifications n
             WHERE n.user_id = u.id AND n.type = 'rescue_alert' AND n.created_at > now() - interval '1 hour') AS recent
     FROM fosters f
     JOIN users u ON u.id = f.user_id
     WHERE f.available = true
       AND u.deleted_at IS NULL
       AND u.id <> $2
       AND ST_DWithin(f.location, (SELECT location FROM posts WHERE id = $1), f.radius_km * 1000 * $3)`,
    [postId, alert.author_id, radiusFactor],
  );
  const hour = belemHour();
  const urgent = alert.urgency === 'high';
  for (const target of targets.rows) {
    if (target.recent >= 8) continue;
    const quiet = isQuiet(target.quiet_hours_start, target.quiet_hours_end, hour);
    const title = urgent ? 'Alerta urgente em Belém' : 'Novo alerta de resgate';
    const body = `${alert.approx_label}: ${alert.description.slice(0, 120)}`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'rescue_alert', $2::jsonb)`,
      [target.id, JSON.stringify({ postId, title, body, urgent })],
    );
    if (!quiet) {
      await sendPush(env, target.fcm_tokens, title, body, postId);
    }
  }
}

export async function expandRescueAlert(pool: Pool, env: Env, postId: string): Promise<void> {
  const post = await pool.query<{ boosted: boolean }>(`SELECT boosted FROM posts WHERE id = $1`, [
    postId,
  ]);
  if (!post.rows[0] || post.rows[0].boosted) return;
  const help = await pool.query(
    `SELECT 1 FROM responses WHERE post_id = $1 AND kind = 'will_help'`,
    [postId],
  );
  if ((help.rowCount ?? 0) > 0) return;
  await pool.query(`UPDATE posts SET boosted = true WHERE id = $1`, [postId]);
  await dispatchRescueAlert(pool, env, postId, 1.5);
}

export async function notifyDiaryNote(
  pool: Pool,
  env: Env,
  postId: string,
  writerId: string,
  description: string,
): Promise<void> {
  const post = await pool.query<{ author_id: string; approx_label: string }>(
    `SELECT author_id, approx_label FROM posts WHERE id = $1`,
    [postId],
  );
  const rescue = post.rows[0];
  if (!rescue) return;
  const people = await pool.query<{ id: string; fcm_tokens: string[] }>(
    `SELECT id, fcm_tokens FROM users WHERE id = $1
     UNION
     SELECT u.id, u.fcm_tokens FROM post_follows pf JOIN users u ON u.id = pf.user_id WHERE pf.post_id = $2`,
    [rescue.author_id, postId],
  );
  const title = 'Diário do resgate';
  const snippet = description.trim().slice(0, 120);
  const body = `${rescue.approx_label}: ${snippet}`;
  for (const person of rowsOf<{ id: string; fcm_tokens: string[] }>(people)) {
    if (person.id === writerId) continue;
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'diary', $2::jsonb)`,
      [person.id, JSON.stringify({ postId, title, body })],
    );
    await sendPush(env, person.fcm_tokens, title, body, postId);
  }
}

export async function notifyComment(
  pool: Pool,
  env: Env,
  postId: string,
  commenterId: string,
  bodyText: string,
  parentAuthorId: string | null,
): Promise<void> {
  const post = await pool.query<{ author_id: string; approx_label: string }>(
    `SELECT author_id, approx_label FROM posts WHERE id = $1`,
    [postId],
  );
  const rescue = post.rows[0];
  if (!rescue) return;
  const targets = new Set<string>();
  if (rescue.author_id !== commenterId) targets.add(rescue.author_id);
  if (parentAuthorId && parentAuthorId !== commenterId) targets.add(parentAuthorId);
  if (targets.size === 0) return;
  const people = await pool.query<{ id: string; fcm_tokens: string[] }>(
    `SELECT id, fcm_tokens FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [[...targets]],
  );
  const title = parentAuthorId ? 'Responderam seu comentário' : 'Novo comentário no seu resgate';
  const snippet = bodyText.trim().slice(0, 120);
  const body = `${rescue.approx_label}: ${snippet}`;
  for (const person of rowsOf<{ id: string; fcm_tokens: string[] }>(people)) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'comment', $2::jsonb)`,
      [person.id, JSON.stringify({ postId, title, body })],
    );
    await sendPush(env, person.fcm_tokens, title, body, postId);
  }
}

export async function notifyStatusChange(
  pool: Pool,
  env: Env,
  postId: string,
  status: string,
): Promise<void> {
  const post = await pool.query<{ author_id: string; approx_label: string }>(
    `SELECT author_id, approx_label FROM posts WHERE id = $1`,
    [postId],
  );
  const alert = post.rows[0];
  if (!alert) return;
  const people = await pool.query<{ id: string; fcm_tokens: string[] }>(
    `SELECT id, fcm_tokens FROM users WHERE id = $1
     UNION
     SELECT u.id, u.fcm_tokens FROM post_follows pf JOIN users u ON u.id = pf.user_id WHERE pf.post_id = $2`,
    [alert.author_id, postId],
  );
  const title = 'Atualização de resgate';
  const body = `${alert.approx_label} agora está: ${status}`;
  for (const person of rowsOf<{ id: string; fcm_tokens: string[] }>(people)) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'status', $2::jsonb)`,
      [person.id, JSON.stringify({ postId, title, body, status })],
    );
    await sendPush(env, person.fcm_tokens, title, body, postId);
  }
}

async function sendPush(
  env: Env,
  tokens: string[],
  title: string,
  body: string,
  postId: string,
): Promise<void> {
  if (!env.FIREBASE_PROJECT_ID || tokens.length === 0) return;
  try {
    await ensureFirebaseApp(env);
    const admin = await import('firebase-admin');
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { postId, url: `egua://post/${postId}` },
    });
  } catch {
    // Push is best-effort. The in-app notification is already stored.
  }
}

function belemHour(): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Belem',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date());
  return Number(hour);
}

function isQuiet(start: number | null, end: number | null, hour: number): boolean {
  if (start === null || end === null || start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
