import { z } from 'zod';

export const serviceCheckSchema = z.enum(['ok', 'error']);

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: serviceCheckSchema,
    redis: serviceCheckSchema,
  }),
});

export type ServiceCheck = z.infer<typeof serviceCheckSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function buildHealthResponse(checks: HealthResponse['checks']): HealthResponse {
  const status = checks.database === 'ok' && checks.redis === 'ok' ? 'ok' : 'degraded';
  return healthResponseSchema.parse({ status, checks });
}
