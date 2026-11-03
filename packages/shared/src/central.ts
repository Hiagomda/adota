import { z } from 'zod';

/**
 * Central de resgates: os casos ainda em andamento, do mais urgente para o menos, e as ofertas
 * de ajuda de quem não vai até o animal mas pode ajudar de outro jeito. Transporte não entra:
 * o app não tem carona nem transporte (ver CLAUDE.md).
 */
export const helpOfferKindSchema = z.enum(['foster', 'food', 'vet', 'supplies', 'other']);
export type HelpOfferKind = z.infer<typeof helpOfferKindSchema>;

export const helpOfferStatusSchema = z.enum(['offered', 'accepted', 'declined', 'withdrawn']);
export type HelpOfferStatus = z.infer<typeof helpOfferStatusSchema>;

export const helpOfferSchema = z
  .object({
    kind: helpOfferKindSchema,
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((value) => value.kind !== 'other' || (value.note?.length ?? 0) >= 3, {
    message: 'Conte em poucas palavras como você pode ajudar.',
  });
export type HelpOfferInput = z.infer<typeof helpOfferSchema>;

/** Quem publicou responde a oferta; quem ofereceu só pode desistir. */
export const helpOfferDecisionSchema = z.enum(['accept', 'decline', 'withdraw']);
export type HelpOfferDecision = z.infer<typeof helpOfferDecisionSchema>;

/** Uma oferta ainda conta enquanto ninguém recusou ou desistiu. */
export function helpOfferActive(status: HelpOfferStatus): boolean {
  return status === 'offered' || status === 'accepted';
}

/**
 * Para onde a oferta pode ir. Recusada ou retirada é o fim; quem quiser ajudar de novo faz uma
 * oferta nova. Aceita ainda pode ser retirada por quem ofereceu (imprevisto).
 */
export function nextOfferStatus(
  from: HelpOfferStatus,
  decision: HelpOfferDecision,
): HelpOfferStatus | null {
  if (from === 'offered') {
    if (decision === 'accept') return 'accepted';
    if (decision === 'decline') return 'declined';
    return 'withdrawn';
  }
  if (from === 'accepted' && decision === 'withdraw') return 'withdrawn';
  return null;
}

/** Estados que aparecem na central: a rua (aberto, a caminho, não encontrado) e o recém-resgatado. */
export const centralStatusSchema = z.enum(['open', 'on_the_way', 'not_found', 'rescued']);
export type CentralStatus = z.infer<typeof centralStatusSchema>;

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

export const centralQuerySchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().int().min(1).max(100).optional(),
    species: z.enum(['dog', 'cat', 'other']).optional(),
    status: centralStatusSchema.optional(),
    /** Só casos que ainda ninguém assumiu nem ofereceu ajuda. */
    withoutHelp: bool,
    /** Só casos parados, do que mais precisa de atenção para o que menos. */
    stalled: bool,
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined), {
    message: 'Mande latitude e longitude juntas.',
  })
  .refine((value) => value.radiusKm === undefined || value.latitude !== undefined, {
    message: 'Para filtrar por distância, mande onde você está.',
  });
export type CentralQuery = z.infer<typeof centralQuerySchema>;

export interface CentralScoreInput {
  urgency: 'low' | 'medium' | 'high';
  status: CentralStatus;
  /** Horas desde que o caso foi publicado. */
  ageHours: number;
  /** Quantas pessoas disseram "vou ajudar". */
  goingCount: number;
  /** Ofertas ativas (lar, ração, veterinário, materiais, outra). */
  offerCount: number;
  /** Houve lar temporário oferecido ou aceito. */
  hasFoster: boolean;
  /** Distância até quem olha, quando a pessoa mandou onde está. */
  distanceKm: number | null;
}

export interface CentralScore {
  score: number;
  /** Frases curtas que explicam a posição do caso na lista. */
  reasons: string[];
}

/**
 * Ordem da central: urgência de quem publicou, quem ainda está sem ajuda e há quanto tempo o
 * caso espera. A distância só desempata, para um caso grave longe não sumir atrás de um leve
 * perto. Cada parte vira uma razão legível, para ninguém achar que a ordem é sorteio.
 */
export function centralScore(input: CentralScoreInput): CentralScore {
  const reasons: string[] = [];
  let score = 0;
  if (input.urgency === 'high') {
    score += 60;
    reasons.push('Marcado como urgente');
  } else if (input.urgency === 'medium') {
    score += 30;
  }
  const street = input.status !== 'rescued';
  if (street && input.goingCount === 0) {
    score += 30;
    reasons.push('Ninguém a caminho');
  }
  if (input.status === 'not_found') {
    score += 10;
    reasons.push('Procuraram e não encontraram');
  }
  if (input.status === 'rescued' && !input.hasFoster) {
    score += 15;
    reasons.push('Resgatado, precisa de lar temporário');
  }
  if (input.offerCount === 0 && input.goingCount === 0) {
    score += 10;
  }
  // Esperar pesa até um dia; depois disso o caso não fica mais urgente só por ser antigo.
  const hours = Math.max(0, Math.min(input.ageHours, 24));
  score += Math.round(hours * (20 / 24));
  if (input.ageHours >= 6 && input.goingCount === 0 && street) {
    reasons.push(`Esperando há ${waitLabel(input.ageHours)}`);
  }
  if (input.distanceKm !== null) {
    // No máximo 10 pontos: perto ajuda, mas não passa na frente de um caso grave.
    score += Math.max(0, 10 - Math.floor(input.distanceKm));
    if (input.distanceKm < 2) reasons.push('Bem perto de você');
  }
  return { score, reasons };
}

function waitLabel(hours: number): string {
  if (hours < 24) return `${Math.floor(hours)} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 dia' : `${days} dias`;
}

/**
 * Distância para mostrar: arredondada em meio quilômetro e nunca abaixo de 0,5 km, para não
 * servir de régua até o ponto exato do animal (que só quem vai ajudar vê).
 */
export function publicDistanceKm(meters: number): number {
  const half = Math.round(meters / 500) / 2;
  return Math.max(0.5, half);
}

export interface StalledInput {
  urgency: 'low' | 'medium' | 'high';
  status: CentralStatus;
  /** Horas desde que o caso foi publicado. */
  ageHours: number;
  /** Horas desde a última novidade (diário, vou ajudar, oferta, avistamento, Casa Amiga). */
  quietHours: number;
  goingCount: number;
  /** Idade em horas da oferta mais antiga ainda sem resposta, ou null. */
  pendingOfferHours: number | null;
  hasFoster: boolean;
}

export interface StalledCase {
  /** Quanto maior, antes na fila. */
  priority: number;
  /** Frases curtas com o motivo, para a equipe saber por que o caso está ali. */
  reasons: string[];
}

/** Quanto tempo sem novidade faz um caso na rua contar como parado, por urgência. */
export const STALLED_QUIET_HOURS: Record<'low' | 'medium' | 'high', number> = {
  high: 6,
  medium: 24,
  low: 48,
};
/** Oferta esperando resposta de quem publicou há mais que isso. */
export const STALLED_OFFER_HOURS = 24;
/** Resgatado sem lar temporário há mais que isso. */
export const STALLED_NO_FOSTER_HOURS = 72;

/**
 * Casos parados: na rua sem novidade além do prazo da urgência, oferta sem resposta há mais de um
 * dia, ou resgatado sem lar há mais de três dias. Os critérios são fixos e cada um vira uma razão
 * legível; a prioridade soma urgência, tempo parado (até quatro vezes o prazo) e falta de ajuda.
 */
export function stalledCase(input: StalledInput): StalledCase | null {
  const reasons: string[] = [];
  let priority = 0;
  const street = input.status !== 'rescued';
  const limit = STALLED_QUIET_HOURS[input.urgency];
  if (street && input.quietHours >= limit) {
    reasons.push(`Sem novidade há ${waitLabel(input.quietHours)}`);
    priority += Math.round(Math.min(input.quietHours / limit, 4) * 10);
    if (input.goingCount === 0) {
      reasons.push('Ninguém a caminho');
      priority += 15;
    }
  }
  if (input.pendingOfferHours !== null && input.pendingOfferHours >= STALLED_OFFER_HOURS) {
    reasons.push(`Oferta sem resposta há ${waitLabel(input.pendingOfferHours)}`);
    priority += 10;
  }
  if (input.status === 'rescued' && !input.hasFoster && input.ageHours >= STALLED_NO_FOSTER_HOURS) {
    reasons.push(`Resgatado e sem lar há ${waitLabel(input.ageHours)}`);
    priority += 10;
  }
  if (reasons.length === 0) return null;
  priority += input.urgency === 'high' ? 30 : input.urgency === 'medium' ? 15 : 0;
  return { priority, reasons };
}
