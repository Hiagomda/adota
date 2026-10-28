import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { reportError } from '../crash/reporter';
import { routeFromPush } from './pushTarget';

/**
 * Tocar num aviso abre o resgate dele (ou a tela que o aviso indica), com o app fechado ou em segundo plano. Cada aviso abre uma
 * vez só: o mesmo toque volta a cada render e não pode empilhar telas.
 */
export function usePushOpen(ready: boolean): void {
  const response = Notifications.useLastNotificationResponse();
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !response) return;
    const request = response.notification.request;
    if (opened.current === request.identifier) return;
    opened.current = request.identifier;
    const route = routeFromPush(request.content.data);
    if (!route) return;
    try {
      router.push(route as never);
    } catch (error) {
      reportError(error, { source: 'handled', where: 'push:open-post' });
    }
  }, [ready, response]);
}
