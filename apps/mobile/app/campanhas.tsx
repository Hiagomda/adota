import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../src/api';
import type { CampaignSummary } from '../src/campaign/campaign';
import { CampaignTile } from '../src/campaign/CampaignTile';
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  Header,
  Segmented,
  SkeletonRows,
} from '../src/components/ui';
import { isTeamRole, useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

type Tab = 'open' | 'ended' | 'mine';

/** Campanhas de ONGs e protetores verificados, com o dinheiro confirmado por comprovante. */
export default function CampaignsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const [tab, setTab] = useState<Tab>('open');
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const canCreate = Boolean(me.data && (me.data.verified || isTeamRole(me.data.role)));
  const list = useQuery({
    queryKey: ['campaigns', tab, token],
    queryFn: () => api<{ campaigns: CampaignSummary[] }>(`/campaigns?status=${tab}`, { token }),
    enabled: tab !== 'mine' || Boolean(token),
  });
  const campaigns = list.data?.campaigns ?? [];
  const tabs = [
    { value: 'open' as const, label: 'Abertas' },
    { value: 'ended' as const, label: 'Encerradas' },
    ...(canCreate ? [{ value: 'mine' as const, label: 'Minhas' }] : []),
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Campanhas" large onBack={() => router.back()} />
          <View style={styles.body}>
            <AppText color="textSecondary">
              Cada campanha mostra a meta, o prazo, quem é o responsável e o extrato com
              comprovantes. A doação vai pelo Pix direto para quem cuida: o app não recebe nem
              repassa dinheiro.
            </AppText>
            {canCreate ? (
              <Button
                title="Abrir campanha"
                icon="plus"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/campanha/nova')}
              />
            ) : null}
            <Segmented
              options={tabs}
              value={tab}
              onChange={setTab}
              accessibilityLabel="Quais campanhas mostrar"
            />
            {list.isLoading ? (
              <SkeletonRows />
            ) : list.isError ? (
              <ErrorState
                title="Não consegui carregar as campanhas"
                body={messageFrom(list.error)}
                onRetry={() => void list.refetch()}
              />
            ) : campaigns.length === 0 ? (
              <EmptyState
                pose="bowl"
                title={
                  tab === 'open'
                    ? 'Nenhuma campanha aberta agora'
                    : tab === 'ended'
                      ? 'Nenhuma campanha encerrada ainda'
                      : 'Você ainda não abriu campanha'
                }
                body={
                  tab === 'mine'
                    ? 'Abra uma campanha ligada ao animal: meta, prazo e para que é o dinheiro.'
                    : 'Quando uma ONG ou protetor verificado abrir uma campanha, ela aparece aqui.'
                }
              />
            ) : (
              <View style={styles.list}>
                {campaigns.map((campaign) => (
                  <CampaignTile
                    key={campaign.id}
                    campaign={campaign}
                    onPress={() => router.push(`/campanha/${campaign.id}`)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  list: { gap: spacing.md },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
