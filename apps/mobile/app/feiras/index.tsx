import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Header,
  SkeletonRows,
  useToast,
} from '../../src/components/ui';
import { FairCard } from '../../src/events/FairCard';
import type { AdoptionFair } from '../../src/events/fairs';
import { useFairs } from '../../src/events/useFairs';
import { CupuTip } from '../../src/cupu/CupuTip';
import { useSession } from '../../src/session';
import { screenColumn, spacing, useTheme } from '../../src/theme';

/** Feiras de adoção de ONGs e protetores verificados, da mais próxima no tempo para a última. */
export default function FairsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const fairs = useFairs(token);
  const [removing, setRemoving] = useState<AdoptionFair | null>(null);
  const list = fairs.data?.events ?? [];

  async function remove(fair: AdoptionFair) {
    setRemoving(null);
    try {
      await api(`/adoption-events/${fair.id}`, { method: 'DELETE', token });
      await client.invalidateQueries({ queryKey: ['adoption-events'] });
      toast.show('Feira cancelada. Ela saiu da lista.', 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={fairs.isRefetching}
            onRefresh={() => void fairs.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Feiras de adoção" large onBack={() => router.back()} />
          <AppText color="textSecondary" style={styles.intro}>
            Encontros para conhecer os animais pessoalmente. Quem divulga é ONG ou protetor com
            perfil verificado, e a adoção é sempre gratuita.
          </AppText>
          <CupuTip context="fairs" style={styles.tip} />
          {fairs.data?.canCreate ? (
            <View style={styles.create}>
              <Button
                title="Divulgar uma feira"
                icon="plus"
                variant="secondary"
                fullWidth
                onPress={() => router.push('/feiras/nova')}
              />
            </View>
          ) : null}
          {fairs.isLoading ? (
            <View style={styles.list}>
              <SkeletonRows />
            </View>
          ) : fairs.isError ? (
            <ErrorState
              title="Não consegui carregar as feiras"
              body={messageFrom(fairs.error)}
              onRetry={() => void fairs.refetch()}
            />
          ) : list.length === 0 ? (
            <EmptyState
              pose="sit"
              title="Nenhuma feira marcada"
              body="Quando uma ONG ou protetor verificado marcar uma feira de adoção em Belém, ela aparece aqui e no Início."
              actionLabel={fairs.data?.canCreate ? undefined : 'Sou ONG ou protetor'}
              onAction={fairs.data?.canCreate ? undefined : () => router.push('/ong')}
            />
          ) : (
            <View style={styles.list}>
              {list.map((fair) => (
                <FairCard
                  key={fair.id}
                  fair={fair}
                  onOrganizer={(handle) => router.push(`/user/${handle}`)}
                  onRemove={setRemoving}
                  onError={(message) => toast.show(message, 'error')}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={removing !== null}
        title="Cancelar esta feira?"
        message="Ela sai da lista e do Início. Quem já viu não recebe aviso, então avise nas suas redes também."
        confirmLabel="Cancelar feira"
        cancelLabel="Voltar"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  intro: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tip: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  create: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
