import type { Href } from 'expo-router';

/** After a session exists: permissions first, then the screen the person was trying to open. */
export function continueAfterAuth(
  router: { replace: (href: Href) => void },
  permissionsSeen: boolean,
  returnTo: string | null,
): void {
  const next = (returnTo ?? '/(tabs)') as Href;
  if (!permissionsSeen) {
    router.replace({ pathname: '/permissions', params: { returnTo: returnTo ?? '/(tabs)' } });
    return;
  }
  router.replace(next);
}
