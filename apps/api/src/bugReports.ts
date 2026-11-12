import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireUser } from './authz.js';
import { HttpError } from './http.js';
import { stripControls } from './text.js';

type RouteLimit = { config: object };

/** Quantos avisos abertos uma conta pode ter no mesmo dia, para o botão não virar spam. */
export const MAX_BUG_REPORTS_PER_DAY = 10;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => stripControls(value) || null)
    .nullish();

export const bugReportSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(5, 'Conte um pouquinho mais do que aconteceu.')
      .max(2000, 'Escreva até 2.000 letras.')
      .transform(stripControls),
    screen: optionalText(200),
    appVersion: optionalText(40),
    platform: optionalText(40),
    device: optionalText(120),
  })
  .strict();

export type BugReportInput = z.output<typeof bugReportSchema>;

/**
 * Aviso de bug mandado pelo besourinho do app. Fica no banco para a equipe ler no painel
 * (staff/bugReports.ts). Só com conta, para a equipe poder responder se precisar.
 */
export function registerBugReportRoutes(
  app: FastifyInstance,
  deps: { pool: Pool; writeLimit: RouteLimit },
): void {
  const { pool, writeLimit } = deps;

  app.post('/bug-reports', writeLimit, async (request, reply) => {
    const user = requireUser(request.user);
    const parsed = bugReportSchema.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new HttpError(
        400,
        issue?.path[0] === 'message' ? issue.message : 'Confira o texto e tente de novo.',
      );
    }
    const body = parsed.data;
    const today = await pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM bug_reports
       WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
      [user.id],
    );
    if ((today.rows[0]?.total ?? 0) >= MAX_BUG_REPORTS_PER_DAY) {
      throw new HttpError(429, 'Você já mandou muitos avisos hoje. Obrigado! Tente amanhã.');
    }
    const created = await pool.query<{ id: string }>(
      `INSERT INTO bug_reports (user_id, message, screen, app_version, platform, device)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        user.id,
        body.message,
        body.screen ?? null,
        body.appVersion ?? null,
        body.platform ?? null,
        body.device ?? null,
      ],
    );
    reply.code(201);
    return { id: created.rows[0]?.id };
  });
}
