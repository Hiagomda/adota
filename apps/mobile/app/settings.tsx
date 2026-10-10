import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, messageFrom } from '../src/api';
import {
  AppText,
  Button,
  Card,
  ConfirmDialog,
  Divider,
  Header,
  Input,
  ListItem,
  Notice,
} from '../src/components/ui';
import { VersionMark } from '../src/diagnostics/VersionMark';
import { useSession } from '../src/session';
import { screenColumn, spacing, useTheme } from '../src/theme';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const logout = useSession((state) => state.logout);
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
              <AppText variant="h3">Avisos</AppText>
              <Card padding="none" elevation="none">
                <ListItem
                  title="Ativar silêncio noturno e raio de 15 km"
                  subtitle="Sem avisos das 22h às 7h"
                  icon="moon"
                  onPress={() =>
                    void run(
                      () =>
                        api('/me', {
                          method: 'PATCH',
                          token,
                          body: { quietHoursStart: 22, quietHoursEnd: 7, alertRadiusKm: 15 },
                        }),
                      'Silêncio das 22h às 7h e raio de 15 km salvos.',
                    )
                  }
                />
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
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../src/crash/RouteErrorBoundary';
