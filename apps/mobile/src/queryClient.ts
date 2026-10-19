import { QueryClient } from '@tanstack/react-query';
import { isRetryableError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A VPS fica nos EUA e cada ida e volta custa ~0,3 s daqui. Voltar a uma tela dentro de
      // 30 s mostra o que já veio sem esperar a rede; puxar para atualizar continua buscando.
      staleTime: 30_000,
      retry: (failureCount, error) => failureCount < 2 && isRetryableError(error),
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});
