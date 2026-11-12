import { api } from '../api';
import type { MapBounds } from '../map/geo';
import type { FeedPoint, FeedPointReport, OwnFeedPoint } from './feedPoints';

export function loadFeedPointsIn(bounds: MapBounds): Promise<{ points: FeedPoint[] }> {
  const search = `?west=${bounds.west}&south=${bounds.south}&east=${bounds.east}&north=${bounds.north}`;
  return api<{ points: FeedPoint[] }>(`/feed-points${search}`);
}

export function loadFeedPoint(
  id: string,
  token: string | null,
): Promise<{ point: FeedPoint | OwnFeedPoint }> {
  return api<{ point: FeedPoint | OwnFeedPoint }>(`/feed-points/${id}`, { token });
}

export function loadMyFeedPoints(token: string | null): Promise<{ points: OwnFeedPoint[] }> {
  return api<{ points: OwnFeedPoint[] }>('/feed-points/mine', { token });
}

export function reportFeedPoint(
  id: string,
  report: FeedPointReport,
  token: string,
): Promise<{ report: FeedPointReport; hidden: boolean }> {
  return api(`/feed-points/${id}/report`, { method: 'POST', token, body: { report } });
}
