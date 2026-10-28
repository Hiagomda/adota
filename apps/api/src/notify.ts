import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Env } from './config.js';
import { releaseStaleHelper } from './feed.js';
import { ensureFirebaseApp } from './firebaseAdmin.js';
import { captureServerError } from './monitoring.js';
import { rowsOf } from './session.js';

const queueName = 'rescue-alerts';

interface RescueJob {
  postId: string;
  expanded?: boolean;
  /** Who said "vou ajudar", for the help-check job. */
  userId?: string;
}

/** How long after "vou ajudar" the app asks how it went. */
export const HELP_CHECK_DELAY_MS = 3 * 60 * 60 * 1000;

/** Sem notícia de quem ia ajudar depois disso, o resgate volta a aparecer para outras pessoas. */
export const HELP_EXPIRE_DELAY_MS = 12 * 60 * 60 * 1000;

export function createQueue(redis: Redis): Queue<RescueJob> {
  return new Queue<RescueJob>(queueName, { connection: redis as unknown as ConnectionOptions });
}

export function startWorker(redis: Redis, pool: Pool, env: Env): Worker<RescueJob> {
  const worker = new Worker<RescueJob>(
    queueName,
    async (job) => {
      if (job.name === 'expand') {
        await expandRescueAlert(pool, env, job.data.postId);
        return;
      }
      if (job.name === 'help-check') {
        if (job.data.userId) await remindHelper(pool, env, job.data.postId, job.data.userId);
        return;
      }
      if (job.name === 'help-expire') {
        if (job.data.userId) await releaseHelper(pool, env, job.data.postId, job.data.userId);
        return;
      }
      await dispatchRescueAlert(pool, env, job.data.postId, job.data.expanded ? 1.5 : 1);
    },
    { connection: redis as unknown as ConnectionOptions },
  );
  // Alerta de resgate ou lembrete que falhou some em silêncio se ninguém olhar o log.
  worker.on('failed', (job, error) => {
    captureServerError(error, { where: `worker:${job?.name ?? 'desconhecido'}` });
  });
  return worker;
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

/** Schedules the "Conseguiu ir?" question for someone who just said "vou ajudar". */
export async function enqueueHelperCheck(
  queue: Queue<RescueJob>,
  postId: string,
  userId: string,
): Promise<void> {
  await queue.add(
    'help-check',
    { postId, userId },
    {
      delay: HELP_CHECK_DELAY_MS,
      jobId: `help-check-${postId}-${userId}`,
      // Gone once done, so helping the same rescue again later schedules a new one.
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

/**
 * Agenda a saída automática de quem disse "vou ajudar" e sumiu. O id leva a hora para que dizer
 * "vou ajudar" de novo agende outro job; o antigo encontra a resposta nova e não faz nada.
 */
export async function enqueueHelperExpiry(
  queue: Queue<RescueJob>,
  postId: string,
  userId: string,
): Promise<void> {
  await queue.add(
    'help-expire',
    { postId, userId },
    {
      delay: HELP_EXPIRE_DELAY_MS,
      jobId: `help-expire-${postId}-${userId}-${Date.now()}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

/** Tira quem sumiu do resgate e avisa essa pessoa e quem publicou. */
export async function releaseHelper(
  pool: Pool,
  env: Env,
  postId: string,
  userId: string,
): Promise<boolean> {
  const result = await releaseStaleHelper(pool, postId, userId, HELP_EXPIRE_DELAY_MS);
  if (!result.released) return false;
  const place = result.approxLabel || 'perto de você';
  await notifyUser(
    pool,
    env,
    userId,
    'help_released',
    postId,
    'Liberamos o resgate',
    `Como não teve notícia, o resgate em ${place} voltou a aparecer para outras pessoas. Se você ainda está indo, toque em Eu vou ajudar de novo.`,
  );
  if (result.reopened && result.authorId && result.authorId !== userId) {
    await notifyUser(
      pool,
      env,
      result.authorId,
      'help_released',
      postId,
      'Seu resgate está aberto de novo',
      `Quem ia ajudar em ${place} não deu notícia em 12 horas, então o resgate voltou a aparecer para outras pessoas. Se o animal já está seguro, atualize o status.`,
    );
  }
  return true;
}

/** Notificação no app e, fora do horário de silêncio, push. */
async function notifyUser(
  pool: Pool,
  env: Env,
  userId: string,
  type: string,
  postId: string,
  title: string,
  body: string,
): Promise<void> {
  const found = await pool.query<{
    fcm_tokens: string[];
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
    notifications_enabled: boolean;
  }>(
    `SELECT fcm_tokens, quiet_hours_start, quiet_hours_end, notifications_enabled
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const target = found.rows[0];
  if (!target) return;
  await pool.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, $2, $3::jsonb)`,
    [userId, type, JSON.stringify({ postId, title, body })],
  );
  if (
    target.notifications_enabled &&
    !isQuiet(target.quiet_hours_start, target.quiet_hours_end, belemHour())
  ) {
    await sendPush(pool, env, target.fcm_tokens, title, body, postId);
  }
}

/**
 * Asks a helper how it went, only if they are still on the way: a rescue nobody updated stays
 * "a caminho" forever and hides it from people who could go.
 */
export async function remindHelper(
  pool: Pool,
  env: Env,
  postId: string,
  userId: string,
): Promise<boolean> {
  const found = await pool.query<{
    approx_label: string;
    fcm_tokens: string[];
    quiet_hours_start: number | null;
    quiet_hours_end: number | null;
  }>(
    `SELECT p.approx_label, u.fcm_tokens, u.quiet_hours_start, u.quiet_hours_end
     FROM posts p
     JOIN responses r ON r.post_id = p.id AND r.user_id = $2 AND r.kind = 'will_help'
     JOIN users u ON u.id = r.user_id
     WHERE p.id = $1
       AND p.status = 'on_the_way'
       AND p.hidden = false
       AND u.deleted_at IS NULL
       AND u.notifications_enabled = true`,
    [postId, userId],
  );
  const target = found.rows[0];
  if (!target) return false;
  const title = 'Conseguiu ir?';
  const body = `Conte em ${target.approx_label} se encontrou o animal. Se não deu, toque em Não deu certo.`;
  await pool.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'help_check', $2::jsonb)`,
    [userId, JSON.stringify({ postId, title, body })],
  );
  if (!isQuiet(target.quiet_hours_start, target.quiet_hours_end, belemHour())) {
    await sendPush(pool, env, target.fcm_tokens, title, body, postId);
  }
  return true;
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
       AND u.suspended = false
       AND u.notifications_enabled = true
       AND u.id <> $2
       AND ST_DWithin(f.location, (SELECT location FROM posts WHERE id = $1), f.radius_km * 1000 * $3)
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_id = u.id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = u.id)
       )`,
    [postId, alert.author_id, radiusFactor],
  );
  const hour = belemHour();
  const urgent = alert.urgency === 'high';
  for (const target of targets.rows) {
    if (target.recent >= 8) continue;
    const quiet = isQuiet(target.quiet_hours_start, target.quiet_hours_end, hour);
    const title = urgent ? 'Resgate urgente perto de você' : 'Novo resgate perto de você';
    const body = `${alert.approx_label}: ${alert.description.slice(0, 120)}`;
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'rescue_alert', $2::jsonb)`,
      [target.id, JSON.stringify({ postId, title, body, urgent })],
    );
    if (!quiet) {
      await sendPush(pool, env, target.fcm_tokens, title, body, postId);
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
    await sendPush(pool, env, person.fcm_tokens, title, body, postId);
  }
}

/** Someone saw the animal elsewhere: tell the author, who is going and who follows. */
export async function notifySighting(
  pool: Pool,
  env: Env,
  postId: string,
  seerId: string,
  label: string | null,
  note: string,
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
     SELECT u.id, u.fcm_tokens FROM responses r JOIN users u ON u.id = r.user_id
       WHERE r.post_id = $2 AND r.kind = 'will_help'
     UNION
     SELECT u.id, u.fcm_tokens FROM post_follows pf JOIN users u ON u.id = pf.user_id
       WHERE pf.post_id = $2`,
    [rescue.author_id, postId],
  );
  const title = 'Alguém viu o animal';
  const where = label ?? 'perto do resgate';
  const body = note
    ? `Visto em ${where}: ${note.slice(0, 120)}`
    : `Visto em ${where}. Veja no mapa.`;
  for (const person of rowsOf<{ id: string; fcm_tokens: string[] }>(people)) {
    if (person.id === seerId) continue;
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'sighting', $2::jsonb)`,
      [person.id, JSON.stringify({ postId, title, body })],
    );
    await sendPush(pool, env, person.fcm_tokens, title, body, postId);
  }
}

/**
 * Tells the person who reported that the team looked at it. In the app only, no push: it is
 * not urgent, and the target stays anonymous to them either way.
 */
export async function notifyReportResolved(
  pool: Pool,
  reporterId: string,
  action: 'hide' | 'dismiss',
): Promise<void> {
  const title = 'Sua denúncia foi analisada';
  const body =
    action === 'hide'
      ? 'A equipe tirou o conteúdo do ar. Obrigado por avisar.'
      : 'A equipe analisou e não viu problema desta vez. Obrigado por avisar.';
  await pool.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'report', $2::jsonb)`,
    [reporterId, JSON.stringify({ title, body })],
  );
}

/** Primeira ficha de alguém para um animal: quem cuida recebe aviso e push. */
export async function notifyAdoptionInterest(
  pool: Pool,
  env: Env,
  postId: string,
  authorId: string,
  adopterName: string,
): Promise<void> {
  const author = await pool.query<{ fcm_tokens: string[] }>(
    `SELECT fcm_tokens FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [authorId],
  );
  const target = author.rows[0];
  if (!target) return;
  const first = adopterName.trim().split(/\s+/)[0] || 'Alguém';
  const title = 'Alguém quer adotar';
  const body = `${first} respondeu a ficha de adoção. Veja as respostas no post do animal.`;
  await pool.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'adoption_interest', $2::jsonb)`,
    [authorId, JSON.stringify({ postId, title, body })],
  );
  await sendPush(pool, env, target.fcm_tokens, title, body, postId);
}

/** A equipe decidiu o pedido de selo de ONG ou protetor. Fica só na tela Alertas. */
export async function notifyVerificationDecision(
  pool: Pool,
  userId: string,
  action: 'approve' | 'reject',
): Promise<void> {
  const title =
    action === 'approve' ? 'Seu perfil foi verificado' : 'Seu pedido de selo foi analisado';
  const body =
    action === 'approve'
      ? 'Agora você pode divulgar o Pix nos pedidos de ajuda e publicar feiras de adoção.'
      : 'A equipe não conseguiu confirmar os dados desta vez. Confira e mande de novo em Ajustes.';
  await pool.query(
    `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'verification', $2::jsonb)`,
    [userId, JSON.stringify({ title, body })],
  );
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
    await sendPush(pool, env, person.fcm_tokens, title, body, postId);
  }
}

export async function notifyStatusChange(
  pool: Pool,
  env: Env,
  postId: string,
  status: string,
): Promise<void> {
  const post = await pool.query<{ author_id: string; approx_label: string; type: string }>(
    `SELECT author_id, approx_label, type FROM posts WHERE id = $1`,
    [postId],
  );
  const alert = post.rows[0];
  if (!alert) return;
  // Animal perdido tem tutor: "resgatado" ali quer dizer que voltou para casa.
  const lostHome = alert.type === 'lost' && status === 'rescued';
  const people = await pool.query<{ id: string; fcm_tokens: string[] }>(
    `SELECT id, fcm_tokens FROM users WHERE id = $1
     UNION
     SELECT u.id, u.fcm_tokens FROM post_follows pf JOIN users u ON u.id = pf.user_id WHERE pf.post_id = $2`,
    [alert.author_id, postId],
  );
  const missed = status === 'not_found';
  const title = missed
    ? 'Ninguém encontrou o animal'
    : lostHome
      ? 'O animal perdido voltou para casa'
      : 'Atualização de resgate';
  const statusName =
    {
      open: 'Aberto',
      on_the_way: 'A caminho',
      not_found: 'Não encontrado',
      rescued: lostHome ? 'Voltou para casa' : 'Resgatado',
      fostered: 'Lar temporário',
      for_adoption: 'Para adoção',
      adopted: 'Adotado',
    }[status] ?? status;
  // Kept as "agora está: …" for the other steps: the notification list reads the status from it.
  const body = missed
    ? `${alert.approx_label} agora está: ${statusName}. Se passar por perto, dê uma olhada.`
    : `${alert.approx_label} agora está: ${statusName}`;
  for (const person of rowsOf<{ id: string; fcm_tokens: string[] }>(people)) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, payload) VALUES ($1, 'status', $2::jsonb)`,
      [person.id, JSON.stringify({ postId, title, body, status })],
    );
    await sendPush(pool, env, person.fcm_tokens, title, body, postId);
  }
}

async function sendPush(
  pool: Pool,
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
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { postId, url: `egua://post/${postId}` },
    });
    const dead = deadPushTokens(
      tokens,
      result.responses.map((response) => response.error?.code ?? null),
    );
    if (dead.length > 0) {
      // App desinstalado ou token trocado: o Firebase nunca mais entrega nesse endereço.
      await pool.query(
        `UPDATE users SET fcm_tokens = ARRAY(
           SELECT t FROM unnest(fcm_tokens) AS t WHERE t <> ALL($1::text[])
         )
         WHERE fcm_tokens && $1::text[]`,
        [dead],
      );
    }
  } catch (error) {
    // Push is best-effort: the in-app notification is already stored. Log it for the VPS logs.
    console.error(
      JSON.stringify({ level: 'error', where: 'notify:push', postId, error: String(error) }),
    );
    captureServerError(error, { where: 'notify:push' });
  }
}

/** Códigos do Firebase que dizem que o token morreu; erro de rede ou cota não apaga nada. */
const deadTokenCodes = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Os tokens que o Firebase recusou de vez, na mesma ordem do envio. */
export function deadPushTokens(tokens: string[], errorCodes: (string | null)[]): string[] {
  return tokens.filter((_, index) => {
    const code = errorCodes[index];
    return code !== null && code !== undefined && deadTokenCodes.has(code);
  });
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
