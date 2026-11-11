/**
 * Banner de destaques do Início: campanhas de arrecadação abertas e eventos/mutirões que vêm por
 * aí, numa fila só. Sem React Native, para rodar no node:test.
 */
import type { CampaignSummary } from '../campaign/campaign';
import type { CommunityEvent } from '../events/agenda';

export type Highlight =
  | { kind: 'campaign'; id: string; campaign: CampaignSummary }
  | { kind: 'event'; id: string; event: CommunityEvent };

/** Quantos destaques se revezam no banner, no máximo. */
export const MAX_HIGHLIGHTS = 6;
/** Evento muito longe no calendário ainda não vira destaque. */
export const EVENT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

function liveEvent(event: CommunityEvent, now: number): boolean {
  if (event.reviewStatus !== 'published') return false;
  if (event.state !== 'scheduled' && event.state !== 'happening') return false;
  const starts = Date.parse(event.startsAt);
  const ends = Date.parse(event.endsAt);
  if (Number.isNaN(starts) || Number.isNaN(ends) || ends <= now) return false;
  return starts - now <= EVENT_WINDOW_DAYS * DAY_MS;
}

/**
 * Junta as duas listas: o que está acontecendo agora vem primeiro; depois campanha e evento se
 * alternam (campanha que acaba antes, evento que começa antes), para nenhum dos dois sumir.
 */
export function pickHighlights(
  campaigns: readonly CampaignSummary[],
  events: readonly CommunityEvent[],
  now: Date = new Date(),
  limit: number = MAX_HIGHLIGHTS,
): Highlight[] {
  const at = now.getTime();
  const open = campaigns
    .filter((campaign) => campaign.phase === 'active')
    .slice()
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || b.createdAt.localeCompare(a.createdAt))
    .map((campaign): Highlight => ({ kind: 'campaign', id: `campaign:${campaign.id}`, campaign }));
  const upcoming = events
    .filter((event) => liveEvent(event, at))
    .slice()
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const happening = upcoming
    .filter((event) => Date.parse(event.startsAt) <= at)
    .map((event): Highlight => ({ kind: 'event', id: `event:${event.id}`, event }));
  const later = upcoming
    .filter((event) => Date.parse(event.startsAt) > at)
    .map((event): Highlight => ({ kind: 'event', id: `event:${event.id}`, event }));

  const mixed: Highlight[] = [...happening];
  for (let index = 0; index < Math.max(open.length, later.length); index += 1) {
    const campaign = open[index];
    const event = later[index];
    if (campaign) mixed.push(campaign);
    if (event) mixed.push(event);
  }
  return mixed.slice(0, Math.max(0, limit));
}
