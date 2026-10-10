import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, loadPost, messageFrom } from '../../src/api';
import { AppText, Button, IconButton } from '../../src/components/ui';
import { useSession } from '../../src/session';
import { motion, radius, spacing, useTheme } from '../../src/theme';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
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
      accessibilityLabel="Segure para pausar o resgate"
      style={[styles.screen, { backgroundColor: colors.mediaBackground }]}
      onPressIn={() => setPaused(true)}
      onPressOut={() => setPaused(false)}
    >
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={motion.base}
          accessibilityLabel="Foto do animal"
        />
      ) : null}
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Tempo restante do resgate"
        style={[
          styles.progress,
          { marginTop: insets.top + spacing.sm, backgroundColor: colors.onMediaMuted },
        ]}
      >
        <Animated.View
          style={[styles.progressFill, { width: barWidth, backgroundColor: colors.onMedia }]}
        />
      </View>
      <View style={styles.zones}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar um pouco"
          style={styles.zone}
          onPress={() => seek(-0.2)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Avançar um pouco"
          style={styles.zone}
          onPress={() => seek(0.2)}
        />
      </View>
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.xl, backgroundColor: colors.mediaScrim },
        ]}
      >
        <AppText variant="h3" style={{ color: colors.onMedia }}>
          {post.isError
            ? messageFrom(post.error)
            : (post.data?.approxLabel ?? 'Carregando o resgate...')}
        </AppText>
        {post.data?.description ? (
          <AppText numberOfLines={2} style={{ color: colors.onMedia }}>
            {post.data.description}
          </AppText>
        ) : null}
        <Button
          title="Eu vou ajudar"
          icon="heart"
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => router.push(`/post/${id}`)}
        />
        <View style={styles.close}>
          <IconButton
            icon="x"
            variant="filled"
            accessibilityLabel="Fechar"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progress: {
    height: 3,
    marginHorizontal: spacing.md,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: radius.pill },
  zones: { flex: 1, flexDirection: 'row' },
  zone: { flex: 1 },
  footer: { padding: spacing.xl, gap: spacing.md },
  close: { alignItems: 'center' },
});

// One broken screen must not take the whole app down.
export { RouteErrorBoundary as ErrorBoundary } from '../../src/crash/RouteErrorBoundary';
