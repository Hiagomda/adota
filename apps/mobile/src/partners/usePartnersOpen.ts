import { useQuery } from '@tanstack/react-query';
import { loadPartnersStatus } from './api';

/**
 * Os anúncios de parceiros estão abertos? Enquanto não sabe (carregando ou sem rede), responde
 * que não: é melhor esconder o "anuncie aqui" do que mostrar algo que a equipe desligou.
 */
export function usePartnersOpen(): boolean {
  const status = useQuery({
    queryKey: ['partners', 'status'],
    queryFn: loadPartnersStatus,
    staleTime: 5 * 60 * 1000,
  });
  return status.data?.enabled === true;
}
