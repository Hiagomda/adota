import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, loadPost } from '../../src/api';
import { useSession } from '../../src/session';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const token = useSession((state) => state.token);
  const post = useQuery({ queryKey: ['story-post', id], queryFn: () => loadPost(id, token) });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (token && id)
      void api(`/posts/${id}/story-view`, { method: 'POST', token }).catch(() => undefined);
  }, [id, token]);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => {
      setProgress((current) => {
        if (current >= 1) {
          router.back();
          return 1;
        }
        return current + 0.02;
      });
    }, 100);
    return () => clearInterval(timer);
  }, [paused, router]);

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
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.zones}>
        <Pressable
          style={styles.zone}
          onPress={() => setProgress((current) => Math.max(0, current - 0.2))}
        />
        <Pressable
          style={styles.zone}
          onPress={() => setProgress((current) => Math.min(1, current + 0.2))}
        />
      </View>
      <View style={styles.footer}>
        <Text style={styles.title}>{post.data?.approxLabel}</Text>
        <Pressable style={styles.help} onPress={() => router.push(`/post/${id}`)}>
          <Text style={styles.helpText}>Eu vou ajudar</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
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
  help: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#FF6B3D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { color: '#fff', fontWeight: '700' },
});
