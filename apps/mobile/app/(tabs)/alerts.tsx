import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, loadNotifications } from '../../src/api';
import { useSession } from '../../src/session';
import { useTheme } from '../../src/theme';
import type { AppNotification } from '../../src/types';
import { EmptyState } from '../../src/ui';

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return 'Hoje';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

export default function AlertsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', token],
    queryFn: () => (token ? loadNotifications(token) : Promise.resolve({ notifications: [] })),
    enabled: Boolean(token),
  });
  const groups = new Map<string, AppNotification[]>();
  for (const item of query.data?.notifications ?? []) {
    const label = dayLabel(item.createdAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const sections = [...groups.entries()].map(([title, data]) => ({ title, data }));

  async function open(item: AppNotification) {
    if (token) {
      await api('/notifications/read', { method: 'POST', token });
      await client.invalidateQueries({ queryKey: ['notifications', token] });
    }
    if (item.payload.postId) router.push(`/post/${item.payload.postId}`);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
      <Text style={[styles.title, { color: theme.text }]}>Alertas</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title="Tudo quieto"
            body="Quando um resgate perto de você precisar de gente, o aviso aparece aqui."
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.day, { color: theme.muted }]}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => void open(item)} style={styles.item}>
            <View
              style={[styles.dot, { backgroundColor: item.readAt ? theme.line : theme.accent }]}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                {item.payload.title ?? 'Atualização'}
              </Text>
              <Text style={{ color: theme.muted }}>{item.payload.body}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', padding: 16 },
  day: { paddingHorizontal: 16, paddingTop: 12, fontWeight: '700' },
  item: { flexDirection: 'row', gap: 12, padding: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
