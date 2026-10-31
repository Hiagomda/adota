import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../../src/api';
import {
  AppText,
  Button,
  Card,
  Chip,
  ErrorState,
  Header,
  Icon,
  Input,
  Notice,
  SkeletonRows,
  useToast,
  type IconName,
} from '../../src/components/ui';
import { formatWhatsApp, normalizeWhatsApp } from '../../src/contact/whatsapp';
import type { MapPoint } from '../../src/map/geo';
import { insideServiceArea } from '../../src/map/serviceArea';
import { Mascot } from '../../src/mascot';
import { loadMyPartners } from '../../src/partners/api';
import { PartnerBanner, PartnerPin } from '../../src/partners/PartnerArt';
import { PartnerDetails } from '../../src/partners/PartnerDetails';
import {
  partnerKindIcons,
  partnerKindLabels,
  partnerKinds,
  perkIdeas,
  type OwnPartner,
  type Partner,
  type PartnerKind,
} from '../../src/partners/partners';
import { placeLabel, useAddress } from '../../src/place/address';
import { useAnimalGps } from '../../src/place/gps';
import { PlacePicker } from '../../src/place/PlacePicker';
import { useSession } from '../../src/session';
import { radius, screenColumn, spacing, useTheme } from '../../src/theme';

const NAME_MAX = 80;
const ABOUT_MAX = 300;
const PERK_MAX = 200;
const HOURS_MAX = 120;
const ADDRESS_MAX = 160;

/** Cadastro (ou edição) de um Parceiro do Cupu. A equipe confere antes de aparecer no mapa. */
export default function PartnerFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ?? null;
  const router = useRouter();
  const { colors } = useTheme();
  const token = useSession((state) => state.token);
  const mine = useQuery({
    queryKey: ['partners', 'mine', token],
    queryFn: () => loadMyPartners(token),
    enabled: Boolean(editingId && token),
  });
  const existing = editingId
    ? (mine.data?.partners.find((partner) => partner.id === editingId) ?? null)
    : null;

  if (editingId && !existing) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.column}>
          <Header title="Editar cadastro" onBack={() => router.back()} />
          {mine.isLoading ? (
            <View style={styles.body}>
              <SkeletonRows />
            </View>
          ) : (
            <ErrorState
              title="Não consegui abrir o cadastro"
              body={mine.isError ? messageFrom(mine.error) : 'Esse cadastro não existe mais.'}
              onRetry={() => void mine.refetch()}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return <PartnerForm key={existing?.updatedAt ?? 'novo'} initial={existing} />;
}

function PartnerForm({ initial }: { initial: OwnPartner | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const token = useSession((state) => state.token);
  const gps = useAnimalGps();

  const [kind, setKind] = useState<PartnerKind>(initial?.kind ?? 'petshop');
  const [name, setName] = useState(initial?.name ?? '');
  const [perk, setPerk] = useState(initial?.perk ?? '');
  const [about, setAbout] = useState(initial?.about ?? '');
  const [hours, setHours] = useState(initial?.hours ?? '');
  const [whatsapp, setWhatsapp] = useState(initial ? formatWhatsApp(initial.whatsapp) : '');
  const [instagram, setInstagram] = useState(initial?.instagram ? `@${initial.instagram}` : '');
  const [manual, setManual] = useState<MapPoint | null>(initial?.location ?? null);
  const [typed, setTyped] = useState(initial?.addressText ?? '');
  const [addressTouched, setAddressTouched] = useState(Boolean(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [editFocus] = useState<MapPoint | null>(initial?.location ?? null);

  const located = gps.fix && insideServiceArea(gps.fix) ? gps.fix : null;
  const point = manual ?? located;
  const { address } = useAddress(point);
  const suggested = point && address ? placeLabel(point, address).slice(0, ADDRESS_MAX) : '';
  const addressText = addressTouched ? typed : suggested;
  const phoneOk = normalizeWhatsApp(whatsapp) !== null;
  const ready =
    name.trim().length >= 2 &&
    perk.trim().length >= 5 &&
    phoneOk &&
    point !== null &&
    addressText.trim().length >= 3;

  const preview: Partner = {
    id: initial?.id ?? 'previa',
    name: name.trim() || 'Nome da sua loja',
    kind,
    kindLabel: partnerKindLabels[kind],
    about: about.trim() || null,
    perk: perk.trim() || 'A vantagem que você oferece aparece aqui',
    hours: hours.trim() || null,
    addressText: addressText.trim() || 'Endereço da loja',
    location: point ?? { latitude: -1.45, longitude: -48.49 },
    whatsapp: normalizeWhatsApp(whatsapp) ?? '5591900000000',
    instagram: instagram.trim().replace(/^@/, '') || null,
    featured: false,
  };

  async function send() {
    if (!token) {
      setMessage('Entre na sua conta para cadastrar a loja.');
      return;
    }
    if (!ready || !point) {
      setMessage(
        phoneOk || !whatsapp.trim()
          ? 'Preencha o nome, a vantagem, o WhatsApp e o lugar no mapa.'
          : 'Confira o WhatsApp: DDD e número, como (91) 98888-7777.',
      );
      return;
    }
    setSending(true);
    setMessage(null);
    const body = {
      name: name.trim(),
      kind,
      perk: perk.trim(),
      about: about.trim() || undefined,
      hours: hours.trim() || undefined,
      addressText: addressText.trim(),
      latitude: point.latitude,
      longitude: point.longitude,
      whatsapp: whatsapp.trim(),
      instagram: instagram.trim() || undefined,
    };
    try {
      if (initial) {
        await api(`/partners/${initial.id}`, { method: 'PATCH', token, body });
        toast.show(
          'Mudanças enviadas. A equipe confere de novo antes de voltar ao mapa.',
          'success',
        );
      } else {
        await api('/partners', { method: 'POST', token, body });
        toast.show('Cadastro enviado! Você recebe um aviso quando a equipe aprovar.', 'success');
      }
      await client.invalidateQueries({ queryKey: ['partners'] });
      router.back();
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header
            title={initial ? 'Editar cadastro' : 'Cadastrar minha loja'}
            onBack={() => router.back()}
          />
          <View style={styles.body}>
            {initial?.status === 'approved' ? (
              <Notice
                tone="info"
                message="Ao salvar, a loja sai do mapa até a equipe conferir as mudanças."
              />
            ) : null}

            <PartnerBanner style={styles.banner}>
              <View style={styles.bannerRow}>
                <View style={styles.grow}>
                  <AppText variant="h3" style={{ color: colors.onHero }}>
                    Bora botar tua loja no mapa?
                  </AppText>
                  <AppText variant="bodySmall" style={{ color: colors.onHeroMuted }}>
                    Quatro passos rápidos. A prévia lá embaixo mostra como fica.
                  </AppText>
                </View>
                <Mascot pose="home" size={88} />
              </View>
            </PartnerBanner>

            <FormSection step={1} title="Sua loja" icon="shopping-bag">
              <AppText variant="bodyStrong">Tipo</AppText>
              <View style={styles.wrap}>
                {partnerKinds.map((option) => (
                  <Chip
                    key={option}
                    label={partnerKindLabels[option]}
                    icon={partnerKindIcons[option] as IconName}
                    selected={kind === option}
                    onPress={() => setKind(option)}
                  />
                ))}
              </View>

              <Input
                label="Nome da loja"
                value={name}
                onChangeText={setName}
                placeholder="Ex.: Petshop do Guamá"
                maxLength={NAME_MAX}
              />
            </FormSection>

            <FormSection step={2} title="A vantagem" icon="gift">
              <Input
                label="Vantagem para quem adota ou resgata"
                value={perk}
                onChangeText={setPerk}
                placeholder="Ex.: 10% de desconto em ração para quem adotar pelo app"
                maxLength={PERK_MAX}
                multiline
                helper="É o que aparece em destaque no seu cartão. Aqui ninguém paga pra anunciar: a vantagem é a sua parte."
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.chipRail}
              >
                {perkIdeas.map((idea) => (
                  <Chip key={idea} label={idea} icon="gift" onPress={() => setPerk(idea)} />
                ))}
              </ScrollView>
            </FormSection>

            <FormSection step={3} title="Contato e horário" icon="message-circle">
              <Input
                label="WhatsApp da loja"
                value={whatsapp}
                onChangeText={setWhatsapp}
                keyboardType="phone-pad"
                placeholder="(91) 98888-7777"
                error={whatsapp.trim() && !phoneOk ? 'Use DDD e número.' : undefined}
                helper="Quem tocar em WhatsApp no seu cartão cai direto na conversa com a loja."
              />
              <Input
                label="Instagram (se quiser)"
                value={instagram}
                onChangeText={setInstagram}
                autoCapitalize="none"
                placeholder="@sualoja"
                maxLength={31}
              />
              <Input
                label="Horário (se quiser)"
                value={hours}
                onChangeText={setHours}
                placeholder="Ex.: Seg a sáb, 8h às 18h · plantão 24h"
                maxLength={HOURS_MAX}
              />
            </FormSection>

            <FormSection step={4} title="Onde fica e sobre a loja" icon="map-pin">
              <AppText variant="bodySmall" color="textSecondary">
                {manual
                  ? 'Ponto escolhido no mapa.'
                  : located
                    ? 'O mapa abriu onde você está. Arraste até a porta da loja.'
                    : 'Arraste o mapa até a porta da loja.'}
              </AppText>
              <View style={styles.map}>
                <PlacePicker
                  focus={editFocus ?? (manual ? null : located)}
                  accuracyM={manual ? null : (located?.accuracy ?? null)}
                  urgency="low"
                  onOutside={() => setMessage('Por enquanto só aparecem parceiros de Belém.')}
                  onChange={(next, fromUser) => {
                    if (!fromUser || !insideServiceArea(next)) return;
                    setManual(next);
                    setMessage(null);
                  }}
                />
                {gps.status === 'loading' && !manual ? (
                  <View style={[styles.loading, { backgroundColor: colors.overlay }]}>
                    <ActivityIndicator color={colors.onMedia} />
                    <AppText variant="bodyStrong" style={{ color: colors.onMedia }}>
                      Buscando o GPS...
                    </AppText>
                  </View>
                ) : null}
              </View>
              <Input
                label="Endereço"
                value={addressText}
                onChangeText={(text) => {
                  setAddressTouched(true);
                  setTyped(text);
                }}
                placeholder="Ex.: Rua José Bonifácio, 100 · Guamá"
                maxLength={ADDRESS_MAX}
              />

              <Input
                label="Sobre a loja (se quiser)"
                value={about}
                onChangeText={setAbout}
                placeholder="Ex.: atendemos cães e gatos, fazemos entrega no bairro"
                maxLength={ABOUT_MAX}
                multiline
              />
            </FormSection>

            <View style={styles.previewHead}>
              <PartnerPin size={28} />
              <AppText variant="h3">Prévia do seu cartão</AppText>
            </View>
            <Card elevation="md">
              <PartnerDetails partner={preview} preview />
            </Card>

            {message ? <Notice tone="error" message={message} /> : null}
            <Button
              title={initial ? 'Salvar mudanças' : 'Enviar para a equipe'}
              icon="send"
              variant="secondary"
              size="lg"
              fullWidth
              loading={sending}
              disabled={!ready}
              onPress={() => void send()}
            />
            <AppText variant="caption" color="textSecondary" style={styles.center}>
              O Égua, adota! não cobra nem recebe dinheiro dos parceiros. Venda de animais não é
              permitida.
            </AppText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FormSection({
  step,
  title,
  icon,
  children,
}: {
  step: number;
  title: string;
  icon: IconName;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={[styles.stepDot, { backgroundColor: colors.secondary }]}>
            <AppText variant="bodyStrong" style={{ color: colors.onSecondary }}>
              {step}
            </AppText>
          </View>
          <AppText variant="h3" style={styles.grow}>
            {title}
          </AppText>
          <Icon name={icon} color={colors.primary} />
        </View>
        {children}
      </View>
    </Card>
  );
}

const STEP_DOT = 32;

const styles = StyleSheet.create({
  banner: { padding: spacing.lg },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepDot: {
    width: STEP_DOT,
    height: STEP_DOT,
    borderRadius: STEP_DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.md },
  bleed: { marginHorizontal: -spacing.lg, flexGrow: 0 },
  chipRail: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  map: { borderRadius: radius.lg, overflow: 'hidden' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  center: { textAlign: 'center' },
});

// Uma tela quebrada não pode derrubar o app inteiro.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
