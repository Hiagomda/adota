import {
  HeroiLocalBadge,
  OlheiroVizinhancaBadge,
  PadrinhoNota10Badge,
  PilotoDoBemBadge,
  PortasAbertasBadge,
} from './badges/index';
import type { VolunteerBadge } from './types';

/** Illustration of each seal, by the code the API sends. */
export const badgeArt: Record<VolunteerBadge['code'], typeof HeroiLocalBadge> = {
  local_hero: HeroiLocalBadge,
  good_pilot: PilotoDoBemBadge,
  open_doors: PortasAbertasBadge,
  top_sponsor: PadrinhoNota10Badge,
  neighborhood_scout: OlheiroVizinhancaBadge,
};
