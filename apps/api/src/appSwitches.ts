import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { HttpError } from './http.js';
import { assertPermission } from './staff/policy.js';
import { clientIp, loadSession, userAgent, writeAudit } from './staff/routes.js';

/**
 * Chaves que a equipe liga e desliga no painel. O nome em camelCase é o que o app lê; a coluna
 * guarda em snake_case. Chave nova: entra aqui, com o valor padrão, e numa migração.
 */
export const appSwitchKeys = {
  partnerInvite: 'partner_invite',
} as const;

export type AppSwitchName = keyof typeof appSwitchKeys;
export type AppSwitches = Record<AppSwitchName, boolean>;

/** Valor usado quando a linha não existe (banco sem a migração ou chave nova). */
const defaults: AppSwitches = { partnerInvite: false };

const names = Object.keys(appSwitchKeys) as AppSwitchName[];
const nameSchema = z.object({ name: z.enum(names as [AppSwitchName, ...AppSwitchName[]]) });
const bodySchema = z.object({ enabled: z.boolean() }).strict();

export async function loadAppSwitches(pool: Pool): Promise<AppSwitches> {
  const result = await pool.query<{ key: string; enabled: boolean }>(
    `SELECT key, enabled FROM app_switches`,
  );
  const out: AppSwitches = { ...defaults };
  for (const name of names) {
    const row = result.rows.find((item) => item.key === appSwitchKeys[name]);
    if (row) out[name] = row.enabled;
  }
  return out;
}

export function registerAppSwitchRoutes(app: FastifyInstance, deps: { pool: Pool }) {
  const { pool } = deps;

  // Público e sem conta: o app lê ao abrir. Nada aqui é dado de alguém.
  app.get('/app/switches', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { switches: await loadAppSwitches(pool) };
  });

  app.get('/admin/v1/switches', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    return { switches: await loadAppSwitches(pool) };
  });

  app.put('/admin/v1/switches/:name', async (request) => {
    const session = await loadSession(pool, request);
    assertPermission(session.role, 'posts.moderate');
    const params = nameSchema.safeParse(request.params);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new HttpError(400, 'Confira os dados e tente de novo.');
    }
    const name = params.data.name;
    const before = await loadAppSwitches(pool);
    await pool.query(
      `INSERT INTO app_switches (key, enabled, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [appSwitchKeys[name], body.data.enabled, session.user_id],
    );
    await writeAudit(pool, {
      actorId: session.user_id,
      action: 'app_switch.update',
      targetType: 'app_switch',
      targetId: appSwitchKeys[name],
      before: { enabled: before[name] },
      after: { enabled: body.data.enabled },
      ip: clientIp(request),
      userAgent: userAgent(request),
    });
    return { switches: await loadAppSwitches(pool) };
  });
}
