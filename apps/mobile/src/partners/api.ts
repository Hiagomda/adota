import { api } from '../api';
import { logBestEffort } from '../crash/bestEffort';
import type { MapBounds } from '../map/geo';
import type { OwnPartner, Partner } from './partners';

export function loadPartnersIn(bounds: MapBounds): Promise<{ partners: Partner[] }> {
  const search = `?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`;
  return api<{ partners: Partner[] }>(`/partners${search}`);
}

export function loadSpotlight(
  here: { latitude: number; longitude: number } | null,
): Promise<{ partners: Partner[] }> {
  const search = here ? `?latitude=${here.latitude}&longitude=${here.longitude}` : '';
  return api<{ partners: Partner[] }>(`/partners/spotlight${search}`);
}

export function loadMyPartners(token: string | null): Promise<{ partners: OwnPartner[] }> {
  return api<{ partners: OwnPartner[] }>('/partners/mine', { token });
}

/** Contagem anônima para o parceiro ver quantas pessoas chegaram até ele. Falhar não importa. */
export function countPartnerTap(
  id: string,
  kind: 'view' | 'whatsapp' | 'route',
  token: string | null,
): void {
  void api(`/partners/${id}/tap`, { method: 'POST', token, body: { kind } }).catch(
    logBestEffort('partners:tap'),
  );
}
