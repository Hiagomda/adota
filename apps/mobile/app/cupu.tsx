import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  Notice,
  SectionHeader,
  Skeleton,
  Touchable,
  useToast,
} from '../src/components/ui';
import {
  defaultCupuStyle,
  type CupuAccessory as CupuAccessoryCode,
  type CupuPose as CupuPoseCode,
  type CupuScene as CupuSceneCode,
  type CupuSlot,
  type CupuStyle,
} from '../src/cupu/catalog';
import { Cupu } from '../src/cupu/Cupu';
import { CupuAccessory, CupuScene } from '../src/cupu/CupuArt';
import {
  cupuQueryKey,
  useCupuStatus,
  type CupuClosetItem,
  type CupuStatus,
} from '../src/cupu/useCupu';
import { useSession } from '../src/session';
import { radius, screenColumn, spacing, useTheme } from '../src/theme';

const PREVIEW = 208;
const TILE_ART = 72;
// Três itens por linha, deixando espaço para os vãos.
const TILE_WIDTH = '30%';

const sections: { slot: CupuSlot; title: string; subtitle: string }[] = [
  { slot: 'pose', title: 'Poses', subtitle: 'O jeitinho do Cupu' },
  { slot: 'scene', title: 'Cenários', subtitle: 'O cantinho de Belém atrás dele' },
  { slot: 'accessory', title: 'Enfeites', subtitle: 'Um detalhe em volta' },
];

function TileArt({ item }: { item: CupuClosetItem }) {
  if (item.slot === 'pose') {
    return (
      <Cupu
        size={TILE_ART}
        pose={item.code as CupuPoseCode}
        scene={null}
        accessory="none"
        label=""
      />
    );
  }
  if (item.slot === 'scene')
    return <CupuScene scene={item.code as CupuSceneCode} size={TILE_ART} />;
  return (
    <View style={{ width: TILE_ART, height: TILE_ART }}>
      <CupuScene scene="creme" size={TILE_ART} />
      <View style={StyleSheet.absoluteFill}>
        <CupuAccessory accessory={item.code as CupuAccessoryCode} size={TILE_ART} />
      </View>
    </View>
  );
}

/** Armário do Cupu: poses, cenários e enfeites liberados pelo XP, nível e selos da Sua rede. */
export default function CupuClosetScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const status = useCupuStatus();
  const [draft, setDraft] = useState<CupuStyle | null>(null);
  const saved = status.data?.style ?? defaultCupuStyle;
  const current = draft ?? saved;
  const changed =
    current.pose !== saved.pose ||
    current.scene !== saved.scene ||
    current.accessory !== saved.accessory;

  const save = useMutation({
    mutationFn: (body: CupuStyle) =>
      api<CupuStatus>('/volunteers/me/cupu', { method: 'PUT', token, body }),
    onSuccess: (next) => {
      client.setQueryData(cupuQueryKey(token), next);
      setDraft(null);
      toast.show('Cupu arrumado! Ele aparece assim pelo app.', 'success');
    },
  });

  function choose(item: CupuClosetItem) {
    if (!item.unlocked) {
      toast.show(`${item.name}: ${item.requirement}.`, 'info');
      return;
    }
    setDraft({ ...current, [item.slot]: item.code } as CupuStyle);
  }

  const unlockedCount = status.data?.items.filter((item) => item.unlocked).length ?? 0;
  const totalCount = status.data?.items.length ?? 0;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Armário do Cupu" large onBack={() => router.back()} />
          {!token ? (
            <EmptyState
              pose="login"
              title="Entre para arrumar o Cupu"
              body="As poses, os cenários e os enfeites vêm do XP, do nível e dos selos da sua conta."
              actionLabel="Entrar"
              onAction={() => router.push('/login')}
            />
          ) : status.isError ? (
            <ErrorState
              title="Não consegui abrir o armário"
              body={messageFrom(status.error)}
              onRetry={() => void status.refetch()}
            />
          ) : (
            <>
              <View style={styles.preview}>
                <Cupu
                  size={PREVIEW}
                  pose={current.pose}
                  scene={current.scene}
                  accessory={current.accessory}
                  interactive
                />
                <AppText color="textSecondary" style={styles.center}>
                  Toca no Cupu! Cada ajuda na Sua rede libera coisa nova aqui.
                </AppText>
                {status.data ? (
                  <AppText variant="caption" color="textSecondary">
                    {unlockedCount} de {totalCount} liberados
                  </AppText>
                ) : null}
              </View>
              {sections.map((section) => (
                <View key={section.slot}>
                  <SectionHeader title={section.title} subtitle={section.subtitle} />
                  <View style={styles.grid} accessibilityRole="radiogroup">
                    {status.isLoading
                      ? [0, 1, 2].map((index) => (
                          <View key={index} style={styles.tile}>
                            <Skeleton width={TILE_ART} height={TILE_ART} radius="pill" />
                            <Skeleton width="70%" height={12} />
                          </View>
                        ))
                      : (status.data?.items ?? [])
                          .filter((item) => item.slot === section.slot)
                          .map((item) => {
                            const selected = current[item.slot] === item.code;
                            return (
                              <Touchable
                                key={item.code}
                                haptic={item.unlocked ? 'light' : false}
                                accessibilityRole="radio"
                                accessibilityState={{ selected, disabled: !item.unlocked }}
                                accessibilityLabel={
                                  item.unlocked
                                    ? item.name
                                    : `${item.name}, bloqueado. ${item.requirement}`
                                }
                                onPress={() => choose(item)}
                                style={[
                                  styles.tile,
                                  {
                                    borderColor: selected ? colors.primary : colors.border,
                                    backgroundColor: selected
                                      ? colors.primarySoft
                                      : colors.surfaceRaised,
                                  },
                                ]}
                              >
                                <View style={!item.unlocked ? styles.locked : undefined}>
                                  <TileArt item={item} />
                                </View>
                                {!item.unlocked ? (
                                  <View
                                    style={[styles.lock, { backgroundColor: colors.surfaceMuted }]}
                                  >
                                    <Icon name="lock" size="sm" color={colors.textSecondary} />
                                  </View>
                                ) : null}
                                <AppText variant="caption" style={styles.center}>
                                  {item.name}
                                </AppText>
                                {!item.unlocked ? (
                                  <AppText
                                    variant="caption"
                                    color="textSecondary"
                                    style={styles.center}
                                    numberOfLines={3}
                                  >
                                    {item.requirement}
                                  </AppText>
                                ) : null}
                              </Touchable>
                            );
                          })}
                  </View>
                </View>
              ))}
              <View style={styles.footer}>
                {save.isError ? <Notice tone="error" message={messageFrom(save.error)} /> : null}
                <Button
                  title={save.isPending ? 'Salvando…' : 'Salvar meu Cupu'}
                  icon="check"
                  fullWidth
                  disabled={!changed || save.isPending}
                  onPress={() => save.mutate(current)}
                />
                {changed ? (
                  <Button
                    title="Desfazer"
                    variant="ghost"
                    fullWidth
                    onPress={() => setDraft(null)}
                  />
                ) : null}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  preview: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  center: { textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    justifyContent: 'flex-start',
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  locked: { opacity: 0.45 },
  lock: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
