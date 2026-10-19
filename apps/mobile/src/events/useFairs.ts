import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import type { AdoptionFair } from './fairs';

export interface FairList {
  canCreate: boolean;
  events: AdoptionFair[];
}

/** As próximas feiras e se esta conta pode divulgar uma. Usado no Início e na tela de feiras. */
export function useFairs(token: string | null) {
  return useQuery({
    queryKey: ['adoption-events', token],
    queryFn: () => api<FairList>('/adoption-events', { token }),
  });
}
