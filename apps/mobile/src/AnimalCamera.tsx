import { CameraView } from 'expo-camera';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton, Touchable } from './components/ui';
import { finishCreateCamera, getCreateCameraSurface, subscribeCreateCamera } from './createCamera';
import { radius, spacing, useTheme } from './theme';

const SHUTTER = 72;
const SHUTTER_INNER = 56;

const CLOSED_SURFACE = { open: false, preview: false };

export function AnimalCamera() {
  const { colors } = useTheme();
  const surface = useSyncExternalStore(
    subscribeCreateCamera,
    getCreateCameraSurface,
    () => CLOSED_SURFACE,
  );
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const ready = useRef(false);
  const taking = useRef(false);

  useEffect(() => {
    if (!surface.preview) ready.current = false;
  }, [surface.preview]);

  if (!surface.open) return null;

  async function shoot() {
    if (!surface.preview || !ready.current || !cameraRef.current || taking.current) return;
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
    <View style={[styles.screen, { backgroundColor: colors.mediaBackground }]}>
      {surface.preview ? (
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
      ) : null}
      <View style={[styles.hint, { top: insets.top + spacing.giant + spacing.xl }]}>
        <View style={[styles.hintPill, { backgroundColor: colors.mediaScrim }]}>
          <AppText variant="h3" style={{ color: colors.onMedia }}>
            Tire a foto do animal
          </AppText>
        </View>
      </View>
      <View style={[styles.close, { top: insets.top + spacing.md }]}>
        <IconButton
          icon="x"
          variant="filled"
          accessibilityLabel="Fechar a câmera"
          onPress={() => finishCreateCamera({ canceled: true })}
        />
      </View>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel="Tirar foto"
        haptic="medium"
        pressedScale={0.92}
        onPress={() => void shoot()}
        style={[
          styles.shutter,
          { bottom: insets.bottom + spacing.xxxl, borderColor: colors.onMedia },
        ]}
      >
        <View style={[styles.shutterInner, { backgroundColor: colors.onMedia }]} />
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 20 },
  hint: { position: 'absolute', left: 0, right: 0, zIndex: 2, alignItems: 'center' },
  hintPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  close: { position: 'absolute', left: spacing.lg, zIndex: 2 },
  shutter: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: radius.pill,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: SHUTTER_INNER, height: SHUTTER_INNER, borderRadius: radius.pill },
});
