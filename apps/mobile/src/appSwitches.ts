import { useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Chaves que a equipe liga e desliga no painel (apps/api/src/appSwitches.ts). */
export interface AppSwitches {
  partnerInvite: boolean;
}

/** Enquanto não chega resposta, ou se a API for antiga, tudo fica desligado. */
const off: AppSwitches = { partnerInvite: false };

export function useAppSwitches(): AppSwitches {
  const query = useQuery({
    queryKey: ['app-switches'],
    queryFn: () => api<{ switches: Partial<AppSwitches> }>('/app/switches'),
    staleTime: 5 * 60 * 1000,
  });
  return { ...off, ...query.data?.switches };
}
