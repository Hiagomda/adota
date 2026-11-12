import { z } from 'zod';
import { insideServiceArea } from './serviceArea.js';

/**
 * Pontos solidários: potes de ração e de água na rua para os animais. Quem cadastra pode ser quem
 * cuida do ponto ou alguém que só conhece. Todo mundo vê no mapa depois que a equipe confere
 * (perfil verificado entra direto), e quem passa avisa se abasteceu, se está vazio ou se sumiu.
 */
export const feedPointKindSchema = z.enum(['food', 'water', 'both']);
export type FeedPointKind = z.infer<typeof feedPointKindSchema>;

/** `mine`: eu cuido deste ponto. `known`: conheço, mas quem cuida é outra pessoa. */
export const feedPointRelationSchema = z.enum(['mine', 'known']);
export type FeedPointRelation = z.infer<typeof feedPointRelationSchema>;

export const feedPointStatusSchema = z.enum(['pending', 'approved', 'rejected', 'removed']);
export type FeedPointStatus = z.infer<typeof feedPointStatusSchema>;

export const FEED_POINT_NOTE_MAX = 300;
export const FEED_POINT_ADDRESS_MAX = 160;
/** Pontos esperando a equipe por pessoa: segura quem manda o mesmo ponto várias vezes. */
export const MAX_PENDING_FEED_POINTS = 5;
/** Pessoas diferentes dizendo "não existe mais" que tiram o ponto do mapa até a equipe olhar. */
export const FEED_POINT_GONE_LIMIT = 3;

const photoKey = z.string().regex(/^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/i, {
  message: 'Envie a foto de novo.',
});

export const feedPointRequestSchema = z
  .object({
    kind: feedPointKindSchema,
    relation: feedPointRelationSchema,
    addressText: z.string().trim().min(3).max(FEED_POINT_ADDRESS_MAX),
    note: z.string().trim().max(FEED_POINT_NOTE_MAX).optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    /** Chave devolvida por /uploads/presign. Sem ela, o ponto fica sem foto. */
    photoKey: photoKey.optional(),
    /** Na edição: true tira a foto que estava. */
    removePhoto: z.boolean().optional(),
  })
  .strict()
  .refine(insideServiceArea, { message: 'Por enquanto só aparecem pontos de Belém.' });
export type FeedPointRequestInput = z.infer<typeof feedPointRequestSchema>;

/**
 * O que quem passa pelo ponto conta: abasteci agora, está vazio ou não existe mais. "Conferi"
 * só confirma que o ponto continua lá.
 */
export const feedPointReportSchema = z
  .object({ report: z.enum(['refilled', 'empty', 'checked', 'gone']) })
  .strict();
export type FeedPointReport = z.infer<typeof feedPointReportSchema>['report'];

export const feedPointMapQuerySchema = z
  .object({
    west: z.coerce.number().min(-180).max(180),
    south: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    kind: feedPointKindSchema.optional(),
  })
  .strict()
  .refine((value) => value.west < value.east && value.south < value.north, {
    message: 'Área do mapa inválida.',
  });

export const feedPointReviewSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'remove']),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.action === 'approve' || (value.note?.length ?? 0) >= 5, {
    message: 'Escreva o motivo para quem cadastrou.',
  });
export type FeedPointReviewInput = z.infer<typeof feedPointReviewSchema>;

/**
 * Para onde o ponto vai quando a equipe decide. Aprovar também devolve ao mapa um ponto que saiu
 * por denúncia de "não existe mais"; recusar vale para a fila; tirar vale para o que está no mapa.
 */
export function nextFeedPointStatus(
  from: FeedPointStatus,
  action: FeedPointReviewInput['action'],
): FeedPointStatus | null {
  if (action === 'approve') return from === 'pending' || from === 'removed' ? 'approved' : null;
  if (action === 'reject') return from === 'pending' ? 'rejected' : null;
  return from === 'approved' || from === 'pending' ? 'removed' : null;
}
