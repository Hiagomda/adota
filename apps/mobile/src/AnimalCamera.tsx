import { Feather } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useRef, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { finishCreateCamera, isCreateCameraOpen, subscribeCreateCamera } from './createCamera';

export function AnimalCamera() {
  const open = useSyncExternalStore(subscribeCreateCamera, isCreateCameraOpen, () => false);
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const ready = useRef(false);
  const taking = useRef(false);

  if (!open) return null;

  async function shoot() {
    if (!ready.current || !cameraRef.current || taking.current) return;
    taking.current = true;
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!picture?.uri) {
        finishCreateCamera({ canceled: true });
        return;
      }
      finishCreateCamera({ uri: picture.uri });
    } catch {
      finishCreateCamera({ error: 'Não consegui tirar a foto. Tente de novo.' });
    } finally {
      taking.current = false;
    }
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        mode="picture"
        onCameraReady={() => {
          ready.current = true;
        }}
        onMountError={() => {
          finishCreateCamera({ error: 'Não consegui abrir a câmera. Tente de novo.' });
        }}
      />
      <Text style={[styles.hint, { top: insets.top + 72 }]}>Tire a foto do animal</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar a câmera"
        hitSlop={12}
        style={[styles.close, { top: insets.top + 16 }]}
        onPress={() => finishCreateCamera({ canceled: true })}
      >
        <Feather name="x" size={28} color="#FFFFFF" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tirar foto"
        style={[styles.shutter, { bottom: insets.bottom + 28 }]}
        onPress={() => void shoot()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    backgroundColor: '#000000',
  },
  hint: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 2,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    backgroundColor: 'transparent',
  },
  close: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
});
