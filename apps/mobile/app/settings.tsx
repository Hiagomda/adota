import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadMe, messageFrom } from '../src/api';
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Divider,
  Header,
  Input,
  ListItem,
  Notice,
  Switch,
} from '../src/components/ui';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { permissionOutcome } from '../src/permissions';
import { uploadProfilePhoto } from '../src/place/publish';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

const radiusChoices = [5, 10, 20, 30];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => loadMe(token ?? ''),
    enabled: Boolean(token),
  });
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!me.data) return;
    setName(me.data.name);
    setHandle(me.data.handle);
  }, [me.data]);

  async function run(task: () => Promise<unknown>, success: string) {
    if (!token) {
      setMessage('Entre na sua conta para continuar.');
      return;
    }
    try {
      await task();
      setMessage(success);
    } catch (error) {
      setMessage(messageFrom(error));
    }
  }

  async function saveProfile() {
    const nextName = name.trim();
    const nextHandle = handle.trim().toLowerCase();
    if (!nextName || !/^[a-z0-9._]{3,24}$/.test(nextHandle)) {
      setMessage('O nome não pode ficar vazio e o @ usa de 3 a 24 letras, números, ponto ou _.');
      return;
    }
    setSavingProfile(true);
    await run(async () => {
      await api('/me', {
        method: 'PATCH',
        token,
        body: { name: nextName, handle: nextHandle },
      });
      await client.invalidateQueries({ queryKey: ['me', token] });
    }, 'Nome e @ salvos. Eles não repetem os de outra pessoa.');
    setSavingProfile(false);
  }

  async function changePhoto() {
    if (!token) {
      setMessage('Entre na sua conta para continuar.');
      return;
    }
    if (Platform.OS !== 'web') {
      const outcome = permissionOutcome(await ImagePicker.requestMediaLibraryPermissionsAsync());
      if (outcome !== 'granted') {
        setMessage('Preciso da galeria para trocar a foto do perfil.');
        return;
      }
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const uri = picked.canceled ? undefined : picked.assets?.[0]?.uri;
    if (!uri) return;
    setUploadingPhoto(true);
    await run(async () => {
      const key = await uploadProfilePhoto(token, uri);
      await api('/me', { method: 'PATCH', token, body: { avatarUrl: key } });
      await client.invalidateQueries({ queryKey: ['me', token] });
    }, 'Foto do perfil atualizada.');
    setUploadingPhoto(false);
  }

  async function patchMe(body: Record<string, unknown>, success: string) {
    await run(async () => {
      await api('/me', { method: 'PATCH', token, body });
      await client.invalidateQueries({ queryKey: ['me', token] });
    }, success);
  }

  async function deleteAccount() {
    setDeleting(true);
    await run(async () => {
      await api('/me', { method: 'DELETE', token });
      await logout();
      router.replace('/');
    }, 'Conta excluída.');
    setDeleting(false);
    setConfirmDelete(false);
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Header title="Ajustes" large onBack={() => router.back()} />
          <View style={styles.body}>
            {message ? <Notice message={message} /> : null}

            <View style={styles.section}>
              <AppText variant="h3">Seu perfil</AppText>
              <Card>
                <View style={styles.form}>
                  <View style={styles.photoRow}>
                    <Avatar name={name || 'Você'} uri={me.data?.avatarUrl} size="lg" />
                    <Button
                      title={uploadingPhoto ? 'Enviando foto…' : 'Trocar foto'}
                      icon="camera"
                      variant="outline"
                      disabled={uploadingPhoto}
                      onPress={() => void changePhoto()}
                    />
                  </View>
                  <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
                  <Input
                    label="Nome de usuário"
                    value={handle}
                    onChangeText={(value) => setHandle(value.toLowerCase())}
                    placeholder="seu.nome"
                    autoCapitalize="none"
                    helper="Nome e @ são únicos. Se alguém já usa, a gente avisa."
                  />
                  <Button
                    title={savingProfile ? 'Salvando…' : 'Salvar perfil'}
                    icon="check"
                    fullWidth
                    disabled={savingProfile}
                    onPress={() => void saveProfile()}
                  />
                </View>
              </Card>
            </View>

            <View style={styles.section}>
              <AppText variant="h3">Privacidade e avisos</AppText>
              <Card>
                <View style={styles.form}>
                  <Switch
                    label="Receber avisos"
                    description="Resgates perto de você e comentários nas suas publicações."
                    value={me.data?.notificationsEnabled ?? true}
                    disabled={!me.data}
                    onValueChange={(value) =>
                      void patchMe(
                        { notificationsEnabled: value },
                        value ? 'Avisos ligados.' : 'Avisos desligados.',
                      )
                    }
                  />
                  <Switch
                    label="Silêncio à noite"
                    description="Sem aviso das 22h às 7h."
                    value={me.data?.quietHoursStart === 22 && me.data.quietHoursEnd === 7}
                    disabled={!me.data}
                    onValueChange={(value) =>
                      void patchMe(
                        value
                          ? { quietHoursStart: 22, quietHoursEnd: 7 }
                          : { quietHoursStart: null, quietHoursEnd: null },
                        value ? 'Silêncio das 22h às 7h.' : 'Avisos voltam a qualquer hora.',
                      )
                    }
                  />
                  <Switch
                    label="Mostrar WhatsApp depois do eu vou ajudar"
                    description="Seu número só aparece para quem se ofereceu naquele resgate."
                    value={me.data?.whatsappOptIn ?? false}
                    disabled={!me.data}
                    onValueChange={(value) =>
                      void patchMe(
                        { whatsappOptIn: value },
                        value ? 'WhatsApp liberado depois do eu vou ajudar.' : 'WhatsApp oculto.',
                      )
                    }
                  />
                  <AppText variant="bodySmall" color="textSecondary">
                    Até onde avisar um resgate perto de você
                  </AppText>
                  <View style={styles.chips}>
                    {radiusChoices.map((km) => (
                      <Chip
                        key={km}
                        label={`${km} km`}
                        selected={me.data?.alertRadiusKm === km}
                        onPress={() =>
                          void patchMe({ alertRadiusKm: km }, `Raio de ${km} km salvo.`)
                        }
                      />
                    ))}
                  </View>
                </View>
              </Card>
            </View>

            <View style={styles.section}>
              <AppText variant="h3">ONG ou proteção</AppText>
              <Card>
                <View style={styles.form}>
                  <Input
                    label="Nome da ONG ou proteção"
                    value={organization}
                    onChangeText={setOrganization}
                    placeholder="Nome da ONG ou proteção"
                    helper="Perfis verificados podem divulgar o Pix. O app nunca recebe dinheiro."
                  />
                  <Button
                    title="Pedir verificação"
                    icon="shield"
                    variant="outline"
                    fullWidth
                    onPress={() =>
                      void run(
                        () =>
                          api('/me/verification', {
                            method: 'POST',
                            token,
                            body: { organizationName: organization, note: 'Atuo em Belém.' },
                          }),
                        'Pedido enviado. A equipe analisa antes de liberar o Pix no perfil.',
                      )
                    }
                  />
                </View>
              </Card>
              <Card padding="none" elevation="none">
                <ListItem
                  title="Oferecer lar temporário"
                  subtitle="Registra um lar no centro de Belém, raio de 8 km"
                  icon="home"
                  onPress={() =>
                    void run(
                      () =>
                        api('/fosters', {
                          method: 'POST',
                          token,
                          body: {
                            capacity: 2,
                            speciesAccepted: ['dog', 'cat'],
                            sizesAccepted: ['small', 'medium'],
                            latitude: -1.4558,
                            longitude: -48.5039,
                            radiusKm: 8,
                          },
                        }),
                      'Lar temporário registrado no centro de Belém, raio de 8 km.',
                    )
                  }
                />
              </Card>
            </View>

            <View style={styles.section}>
              <AppText variant="h3">Ajuda e privacidade</AppText>
              <Card padding="none" elevation="none">
                <ListItem
                  title="Suporte"
                  icon="life-buoy"
                  showChevron
                  onPress={() => router.push('/support')}
                />
                <Divider inset />
                <ListItem
                  title="Termos e privacidade"
                  icon="file-text"
                  showChevron
                  onPress={() => router.push('/legal')}
                />
                <Divider inset />
                <ListItem
                  title="Sair da conta"
                  subtitle="Você pode entrar de novo quando quiser."
                  icon="log-out"
                  onPress={() => {
                    void logout().then(() => router.replace('/'));
                  }}
                />
                <Divider inset />
                <ListItem
                  title="Excluir minha conta"
                  subtitle="Apaga telefone, foto e avisos. Não dá para desfazer."
                  icon="trash-2"
                  destructive
                  onPress={() => setConfirmDelete(true)}
                />
              </Card>
            </View>
            <VersionMark />
          </View>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={confirmDelete}
        title="Excluir sua conta?"
        message="Seu perfil é anonimizado e seu telefone, foto e avisos são apagados. Isso não pode ser desfeito."
        confirmLabel="Excluir minha conta"
        destructive
        loading={deleting}
        onConfirm={() => void deleteAccount()}
        onCancel={() => setConfirmDelete(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingBottom: spacing.xxxl },
  column: screenColumn,
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  form: { gap: spacing.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
