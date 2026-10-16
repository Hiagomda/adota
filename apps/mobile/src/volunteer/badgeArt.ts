import {
  HeroiLocalBadge,
  OlheiroVizinhancaBadge,
  PadrinhoNota10Badge,
  PortasAbertasBadge,
} from './badges/index';
import type { VolunteerBadge } from './types';

type BadgeArt = typeof HeroiLocalBadge;

const art: Partial<Record<VolunteerBadge['code'], BadgeArt>> = {
  local_hero: HeroiLocalBadge,
  open_doors: PortasAbertasBadge,
  top_sponsor: PadrinhoNota10Badge,
  neighborhood_scout: OlheiroVizinhancaBadge,
};

/**
 * Illustration of a seal the API sends, or null when the app no longer shows it.
 * The API still sends good_pilot, left from the transport offer the app dropped.
 */
export function badgeArtFor(code: VolunteerBadge['code']): BadgeArt | null {
  return art[code] ?? null;
}
