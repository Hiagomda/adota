import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import { sexLabel, sizeLabel, speciesLabel } from '../../src/animalLabels';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  InfoChip,
  ListItem,
  Notice,
  Photo,
  SkeletonRows,
  StatusPill,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { formatWhen } from '../../src/format';
import { careChips } from '../../src/post/care';
import { HealthSheet } from '../../src/passport/HealthSheet';
import { LinkSheet } from '../../src/passport/LinkSheet';
import {
  custodyLabels,
  custodyPeriod,
  dueLabel,
  formatDay,
  healthKindLabel,
  type Passport,
} from '../../src/passport/passport';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const timelineIcons: Record<Passport['timeline'][number]['kind'], IconName> = {
  occurrence: 'map-pin',
  status: 'flag',
  note: 'edit-3',
  sighting: 'eye',
  health: 'heart',
  custody: 'home',
};

/** O que aconteceu com o animal, em todos os posts dele, num lugar só. */
export default function PassportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const [healthOpen, setHealthOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  // Cada abertura monta o formulário de novo, limpo e com uma chave nova contra envio duplo.
  const [sheetSession, setSheetSession] = useState(0);
  const [removing, setRemoving] = useState<Passport['health'][number] | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const passport = useQuery({
    queryKey: ['passport', id, token],
    queryFn: () => api<Passport>(`/animals/${id}`, { token }),
    enabled: Boolean(id),
  });
  const data = passport.data;

  async function refresh() {
    await client.invalidateQueries({ queryKey: ['passport'] });
  }

  async function removeRecord(record: Passport['health'][number]) {
    setRemoving(null);
    try {
      await api(`/animals/${data?.id ?? id}/health/${record.id}`, { method: 'DELETE', token });
      await refresh();
      toast.show('Registro tirado do passaporte.', 'success');
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    }
  }

  async function decide(linkId: string, action: 'accept' | 'reject') {
    if (deciding) return;
    setDeciding(linkId);
    try {
      await api(`/animal-links/${linkId}/${action}`, { method: 'POST', token });
      await refresh();
      await client.invalidateQueries({ queryKey: ['post'] });
      toast.show(
        action === 'accept'
          ? 'Pronto: as ocorrências agora são um passaporte só.'
          : 'Pedido recusado. Os posts continuam separados.',
        'success',
      );
    } catch (error) {
      toast.show(messageFrom(error), 'error');
    } finally {
      setDeciding(null);
    }
  }

  const title = data?.name ?? (data ? `${speciesLabel[data.species] ?? 'Animal'} sem nome` : '');
  const facts = data
    ? [
        speciesLabel[data.species],
        sizeLabel[data.size] ? `Porte ${sizeLabel[data.size]?.toLowerCase()}` : null,
        data.sex ? sexLabel[data.sex] : null,
        data.ageEstimate,
      ].filter((item): item is string => Boolean(item))
    : [];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={passport.isRefetching}
            onRefresh={() => void passport.refetch()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.column}>
          <Header title="Passaporte do animal" onBack={() => router.back()} />
          {passport.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : passport.isError || !data ? (
            <ErrorState
              title="Não consegui abrir o passaporte"
              body={messageFrom(passport.error)}
              onRetry={() => void passport.refetch()}
            />
          ) : (
            <View style={styles.body}>
              <View style={styles.hero}>
                <Photo
                  uri={data.photos[0]?.thumbUrl}
                  style={[styles.heroPhoto, { backgroundColor: colors.surfaceMuted }]}
                  accessibilityLabel={`Foto de ${title}`}
                />
                <View style={styles.heroText}>
                  <AppText variant="h2">{title}</AppText>
                  <AppText color="textSecondary">{facts.join(' · ')}</AppText>
                  <View style={styles.row}>
                    <StatusPill status={data.status} />
                  </View>
                  <AppText variant="bodySmall" color="textSecondary">
                    Na rede desde {formatWhen(data.firstSeenAt)}
                  </AppText>
                </View>
              </View>

              {careChips(data.care).length > 0 ? (
                <View style={styles.chips}>
                  {careChips(data.care).map((chip) => (
                    <InfoChip
                      key={chip.key}
                      label={chip.label}
                      icon={chip.yes ? 'check' : 'x'}
                      tone={chip.yes ? 'success' : 'neutral'}
                    />
                  ))}
                </View>
              ) : null}

              {data.photos.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.gallery}>
                    {data.photos.slice(1).map((photo) => (
                      <Photo
                        key={photo.url}
                        uri={photo.thumbUrl}
                        style={[styles.thumb, { backgroundColor: colors.surfaceMuted }]}
                        accessibilityLabel={`Outra foto de ${title}`}
                      />
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              {data.pendingLinks.map((link) => (
                <Card key={link.id} elevation="sm">
                  <View style={styles.cardBody}>
                    <AppText variant="h3">Pode ser o mesmo animal?</AppText>
                    <AppText color="textSecondary">
                      {link.requesterName ?? 'Alguém'} acha que este animal é o mesmo do post em{' '}
                      {link.otherLabel ?? 'outro lugar'}: “{link.reason}”
                    </AppText>
                    {link.otherPostId ? (
                      <Button
                        title="Ver o outro post"
                        icon="external-link"
                        variant="ghost"
                        onPress={() => router.push(`/post/${link.otherPostId}`)}
                      />
                    ) : null}
                    <View style={styles.actions}>
                      <Button
                        title="É o mesmo"
                        icon="check"
                        loading={deciding === link.id}
                        onPress={() => void decide(link.id, 'accept')}
                      />
                      <Button
                        title="Não é"
                        variant="outline"
                        disabled={deciding === link.id}
                        onPress={() => void decide(link.id, 'reject')}
                      />
                    </View>
                  </View>
                </Card>
              ))}

              <View style={styles.section}>
                <AppText variant="h2">Saúde</AppText>
                {!data.permissions.caretaker ? (
                  <AppText color="textSecondary">
                    Você vê só o que quem cuida marcou como público. Remédios e exames ficam com
                    quem cuida do animal.
                  </AppText>
                ) : null}
                {data.health.length === 0 ? (
                  <EmptyState
                    compact
                    pose="bowl"
                    title="Nenhum registro ainda"
                    body={
                      data.permissions.canAddHealth
                        ? 'Anote vacinas, vermífugo, castração e remédios. Quem adotar recebe o histórico.'
                        : 'Quando quem cuida registrar vacinas ou castração, aparece aqui.'
                    }
                  />
                ) : (
                  <Card padding="none" elevation="md">
                    {data.health.map((record, index) => (
                      <View key={record.id}>
                        {index > 0 ? <Divider inset /> : null}
                        <View style={styles.record}>
                          <View
                            style={[styles.recordIcon, { backgroundColor: colors.primarySoft }]}
                          >
                            <Icon name="heart" size="sm" color={colors.onPrimarySoft} />
                          </View>
                          <View style={styles.recordText}>
                            <AppText variant="bodyStrong">
                              {healthKindLabel(record.kind)}: {record.title}
                            </AppText>
                            <AppText variant="bodySmall" color="textSecondary">
                              {[
                                formatDay(record.occurredOn),
                                record.recordedBy ? `por ${record.recordedBy}` : null,
                                record.visibility === 'caretakers' ? 'só quem cuida vê' : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </AppText>
                            {record.nextDueOn ? (
                              <AppText variant="bodySmallStrong" color="primary">
                                Próxima: {formatDay(record.nextDueOn)} ({dueLabel(record.nextDueOn)}
                                )
                              </AppText>
                            ) : null}
                            {record.notes ? (
                              <AppText variant="bodySmall">{record.notes}</AppText>
                            ) : null}
                          </View>
                          {record.canRemove ? (
                            <Button
                              title="Tirar"
                              variant="ghost"
                              accessibilityLabel={`Tirar o registro ${record.title}`}
                              onPress={() => setRemoving(record)}
                            />
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </Card>
                )}
                {data.permissions.canAddHealth ? (
                  <Button
                    title="Registrar vacina, remédio ou consulta"
                    icon="plus"
                    variant="secondary"
                    fullWidth
                    onPress={() => {
                      setSheetSession((value) => value + 1);
                      setHealthOpen(true);
                    }}
                  />
                ) : null}
              </View>

              {data.custody.length > 0 ? (
                <View style={styles.section}>
                  <AppText variant="h2">Lares e adoção</AppText>
                  <Card padding="none" elevation="md">
                    {data.custody.map((item, index) => (
                      <View key={item.id}>
                        {index > 0 ? <Divider inset /> : null}
                        <ListItem
                          title={custodyLabels[item.kind] ?? 'Guarda'}
                          subtitle={[item.person?.name, custodyPeriod(item.startedAt, item.endedAt)]
                            .filter(Boolean)
                            .join(' · ')}
                          icon={item.kind === 'adoption' ? 'star' : 'home'}
                          showChevron={Boolean(item.person)}
                          onPress={
                            item.person
                              ? () => router.push(`/user/${item.person?.handle ?? ''}`)
                              : undefined
                          }
                        />
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              <View style={styles.section}>
                <AppText variant="h2">Ocorrências</AppText>
                <AppText color="textSecondary">
                  Todos os posts deste animal. Se ele apareceu em outro post, junte aqui para não
                  perder o histórico.
                </AppText>
                <Card padding="none" elevation="md">
                  {data.occurrences.map((item, index) => (
                    <View key={item.postId}>
                      {index > 0 ? <Divider inset /> : null}
                      <ListItem
                        title={item.approxLabel}
                        subtitle={`${formatWhen(item.createdAt)} · por ${item.author.name}`}
                        icon={item.type === 'lost' ? 'search' : 'map-pin'}
                        showChevron
                        onPress={() => router.push(`/post/${item.postId}`)}
                      />
                    </View>
                  ))}
                </Card>
                {data.permissions.canLink ? (
                  <Button
                    title="É o mesmo animal de outro post"
                    icon="link"
                    variant="outline"
                    fullWidth
                    onPress={() => {
                      setSheetSession((value) => value + 1);
                      setLinkOpen(true);
                    }}
                  />
                ) : null}
              </View>

              <View style={styles.section}>
                <AppText variant="h2">Linha do tempo</AppText>
                {data.timeline.map((item) => (
                  <View key={item.id} style={styles.event}>
                    <View style={[styles.dot, { backgroundColor: colors.surfaceMuted }]}>
                      <Icon name={timelineIcons[item.kind]} size="sm" color={colors.primary} />
                    </View>
                    <View style={styles.recordText}>
                      <AppText variant="bodyStrong">{item.title}</AppText>
                      <AppText variant="bodySmall" color="textSecondary">
                        {[formatWhen(item.date), item.detail].filter(Boolean).join(' · ')}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>

              <Notice
                tone="info"
                message="O passaporte acompanha o animal entre resgate, lares e adoção. Dados de saúde marcados como só quem cuida não aparecem para mais ninguém."
              />
            </View>
          )}
        </View>
      </ScrollView>
      {data ? (
        <>
          <HealthSheet
            key={`health-${sheetSession}`}
            visible={healthOpen}
            animalId={data.id}
            token={token}
            onClose={() => setHealthOpen(false)}
            onSaved={async () => {
              setHealthOpen(false);
              await refresh();
              toast.show('Registro salvo no passaporte.', 'success');
            }}
          />
          <LinkSheet
            key={`link-${sheetSession}`}
            visible={linkOpen}
            passport={data}
            token={token}
            onClose={() => setLinkOpen(false)}
            onDone={async (message) => {
              setLinkOpen(false);
              await refresh();
              await client.invalidateQueries({ queryKey: ['post'] });
              toast.show(message, 'success');
            }}
          />
        </>
      ) : null}
      <ConfirmDialog
        visible={removing !== null}
        title="Tirar este registro?"
        message="Ele some do passaporte. A equipe ainda consegue ver que existiu, para auditoria."
        confirmLabel="Tirar"
        cancelLabel="Voltar"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void removeRecord(removing);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  hero: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  heroPhoto: { width: 112, height: 112, borderRadius: radius.xl },
  heroText: { flex: 1, gap: spacing.xs },
  row: { flexDirection: 'row' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gallery: { flexDirection: 'row', gap: spacing.sm },
  thumb: { width: 88, height: 88, borderRadius: radius.lg },
  section: { gap: spacing.md },
  cardBody: { gap: spacing.sm, padding: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  record: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  recordIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordText: { flex: 1, gap: 2 },
  event: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Uma tela quebrada não derruba o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
