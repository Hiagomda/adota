import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadPost, messageFrom } from '../../src/api';
import { useSession } from '../../src/session';
import { palette } from '../../src/theme';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const token = useSession((state) => state.token);
  const post = useQuery({ queryKey: ['story-post', id], queryFn: () => loadPost(id, token) });
  const [{ progress, barWidth }] = useState(() => {
    const value = new Animated.Value(0);
    return {
      progress: value,
      barWidth: value.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
      }),
    };
  });
  const amount = useRef(0);
  const finished = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (token && id)
      void api(`/posts/${id}/story-view`, { method: 'POST', token }).catch(() => undefined);
  }, [id, token]);

  useEffect(() => {
    if (paused || finished.current) return undefined;
    const timer = setInterval(() => {
      amount.current = Math.min(1, amount.current + 0.02);
      progress.setValue(amount.current);
      if (amount.current < 1 || finished.current) return;
      finished.current = true;
      router.back();
    }, 100);
    return () => clearInterval(timer);
  }, [paused, progress, router]);

  function seek(delta: number) {
    amount.current = Math.min(1, Math.max(0, amount.current + delta));
    progress.setValue(amount.current);
  }

  const photo = post.data?.media[0]?.url;
  return (
    <Pressable
      style={styles.screen}
      onPressIn={() => setPaused(true)}
      onPressOut={() => setPaused(false)}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      <View style={[styles.progress, { marginTop: insets.top + 8 }]}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>
      <View style={styles.zones}>
        <Pressable style={styles.zone} onPress={() => seek(-0.2)} />
        <Pressable style={styles.zone} onPress={() => seek(0.2)} />
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.title}>
          {post.isError
            ? messageFrom(post.error)
            : (post.data?.approxLabel ?? 'Carregando o resgate...')}
        </Text>
        {post.data?.description ? (
          <Text numberOfLines={2} style={styles.body}>
            {post.data.description}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eu vou ajudar"
          style={styles.help}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
            router.push(`/post/${id}`);
          }}
        >
          <Text style={styles.helpText}>Eu vou ajudar</Text>
        </Pressable>
        <Pressable style={styles.close} onPress={() => router.back()}>
          <Text style={styles.title}>Fechar</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  progress: { height: 3, margin: 12, backgroundColor: 'rgba(255,255,255,0.3)' },
  progressFill: { height: 3, backgroundColor: '#fff' },
  zones: { flex: 1, flexDirection: 'row' },
  zone: { flex: 1 },
  footer: { padding: 20, gap: 12 },
  title: { color: '#fff', fontWeight: '700', fontSize: 18 },
  body: { color: '#fff', fontSize: 15, lineHeight: 20 },
  close: { minHeight: 44, justifyContent: 'center' },
  help: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: palette.caju,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { color: palette.acai, fontWeight: '700' },
});
