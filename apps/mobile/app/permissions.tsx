import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { AppText, Button, Card, ListItem, Divider, Notice } from '../src/components/ui';
import { reportError } from '../src/crash/reporter';
import { Mascot } from '../src/mascot';
import { openAppSettings, openSettingsLabel, permissionOutcome } from '../src/permissions';
import { safeReturnTo } from '../src/auth/returnTo';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

const HERO_MASCOT = 220;

const intro =
  'A localização mostra resgates perto de você. As notificações avisam quando alguém precisa de ajuda.';

type Step =
  | { phase: 'ask' }
  /** Location was refused; the user chooses between the settings and going on without it. */
  | { phase: 'refused'; blocked: boolean };

export default function PermissionsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const token = useSession((state) => state.token);
  const finishPermissions = useSession((state) => state.finishPermissions);
  const [step, setStep] = useState<Step>({ phase: 'ask' });
  const [pending, setPending] = useState(false);

  async function registerPushToken() {
    if (!token) return;
    const notifications = await Notifications.requestPermissionsAsync();
    if (notifications.status !== 'granted') return;
    try {
      const push = await Notifications.getDevicePushTokenAsync();
      const value = typeof push.data === 'string' ? push.data : null;
      if (value) await api('/me/fcm-token', { method: 'POST', token, body: { token: value } });
    } catch (error) {
      // No Firebase config in this build, or no Play Services: alerts stay in-app for now.
      reportError(error, { source: 'handled', where: 'permissions:push-token' });
    }
  }

  async function finish() {
    await finishPermissions();
    router.replace((safeReturnTo(params.returnTo) ?? '/(tabs)') as Href);
  }

  async function allow() {
    setPending(true);
    try {
      const location = permissionOutcome(await Location.requestForegroundPermissionsAsync());
      await registerPushToken();
      if (location !== 'granted') {
        setStep({ phase: 'refused', blocked: location === 'blocked' });
        return;
      }
      await finish();
    } catch (error) {
      // A permission dialog that fails to open must not leave the button spinning forever.
      reportError(error, { source: 'handled', where: 'permissions:allow' });
      setStep({ phase: 'refused', blocked: false });
    } finally {
      setPending(false);
    }
  }

  const refused = step.phase === 'refused' ? step : null;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.hero}>
        <Mascot pose="search" size={HERO_MASCOT} label="Mascote do Égua, adota!" />
      </View>
      <View style={styles.column}>
        <AppText variant="display">Perto de você</AppText>
        <AppText color="textSecondary">{intro}</AppText>
        <Card padding="none" elevation="none">
          <ListItem
            title="Localização"
            subtitle="Para mostrar resgates perto de você"
            icon="map-pin"
          />
          <Divider inset />
          <ListItem
            title="Notificações"
            subtitle="Para avisar quando alguém precisa de ajuda"
            icon="bell"
          />
        </Card>
        {refused ? (
          <>
            <Notice
              tone="warning"
              message={
                refused.blocked
                  ? 'A localização está bloqueada para o app. Sem ela, os resgates usam o centro de Belém.'
                  : 'Sem a localização, os resgates usam o centro de Belém. Você pode permitir depois.'
              }
              action={
                refused.blocked
                  ? { label: openSettingsLabel, onPress: () => void openAppSettings() }
                  : undefined
              }
            />
            {refused.blocked ? null : (
              <Button
                title="Permitir localização"
                size="lg"
                fullWidth
                onPress={() => void allow()}
              />
            )}
            <Button
              title="Continuar sem localização"
              variant={refused.blocked ? 'secondary' : 'ghost'}
              size="lg"
              fullWidth
              onPress={() => void finish()}
            />
          </>
        ) : (
          <Button
            title="Entendi"
            size="lg"
            loading={pending}
            fullWidth
            onPress={() => void allow()}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  column: { ...screenColumn, padding: spacing.xxl, gap: spacing.lg },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
