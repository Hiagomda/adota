import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useSession } from '../session';
import { defaultCupuStyle, type CupuClosetItem, type CupuStyle } from './catalog';

export interface CupuStatus {
  style: CupuStyle;
  level: string;
  items: CupuClosetItem[];
}

/** O Cupu muda pouco: só quando a pessoa mexe no armário ou sobe de nível. */
const CUPU_STALE_MS = 5 * 60 * 1000;

export type { CupuClosetItem };

export function cupuQueryKey(token: string | null) {
  return ['cupu', token] as const;
}

export function useCupuStatus() {
  const token = useSession((state) => state.token);
  return useQuery({
    queryKey: cupuQueryKey(token),
    queryFn: () => api<CupuStatus>('/volunteers/me/cupu', { token }),
    enabled: Boolean(token),
    staleTime: CUPU_STALE_MS,
  });
}

/** O jeito que a pessoa deixou o Cupu; sem conta ou sem rede, o Cupu de sempre. */
export function useCupuStyle(): CupuStyle {
  return useCupuStatus().data?.style ?? defaultCupuStyle;
}
