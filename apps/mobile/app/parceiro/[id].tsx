import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import { Button, Card, ErrorState, Header, SkeletonRows } from '../../src/components/ui';
import { countPartnerTap } from '../../src/partners/api';
import { PartnerDetails } from '../../src/partners/PartnerDetails';
import type { Partner } from '../../src/partners/partners';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/** Um Parceiro do Cupu, aberto pelo cartão "Parceiro do bem" do feed. */
export default function PartnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const found = useQuery({
    queryKey: ['partner', id, token],
    queryFn: () => api<{ partner: Partner }>(`/partners/${id}`, { token }),
  });
  const partner = found.data?.partner;

  useEffect(() => {
    if (partner) countPartnerTap(partner.id, 'view', token);
    // Conta uma vez por abertura da tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner?.id]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Header title="Parceiro do Cupu" onBack={() => router.back()} />
          <View style={styles.body}>
            {found.isLoading ? (
              <SkeletonRows />
            ) : partner ? (
              <>
                <Card elevation="md">
                  <PartnerDetails partner={partner} />
                </Card>
                <Button
                  title="Ver parceiros no mapa"
                  icon="map"
                  variant="outline"
                  fullWidth
                  onPress={() => router.push('/(tabs)/explore')}
                />
              </>
            ) : (
              <ErrorState
                title="Não consegui abrir o parceiro"
                body={messageFrom(found.error)}
                onRetry={() => void found.refetch()}
              />
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
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
