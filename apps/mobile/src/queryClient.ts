import { QueryClient } from '@tanstack/react-query';
import { isRetryableError, setWriteHandler } from './api';
import { logBestEffort } from './crash/bestEffort';
import { listsAfterWrite } from './postLists';

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

// Depois de publicar, ajudar ou mudar status, perfil, adoção e stories também mostram a mudança,
// sem esperar os 30 s do cache.
setWriteHandler((method, path) => {
  for (const queryKey of listsAfterWrite(method, path)) {
    void queryClient.invalidateQueries({ queryKey }).catch(logBestEffort('cache:after-write'));
  }
});
