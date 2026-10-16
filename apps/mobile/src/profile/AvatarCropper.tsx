import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { AppText, Button } from '../components/ui';
import { radius, spacing, useTheme } from '../theme';

const FRAME = 280;

interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

function cropRect(
  imageWidth: number,
  imageHeight: number,
  cover: number,
  userScale: number,
  translateX: number,
  translateY: number,
): CropRect {
  const factor = cover * userScale;
  const shownWidth = imageWidth * factor;
  const shownHeight = imageHeight * factor;
  const imageLeft = FRAME / 2 + translateX - shownWidth / 2;
  const imageTop = FRAME / 2 + translateY - shownHeight / 2;
  const originX = Math.max(0, -imageLeft / factor);
  const originY = Math.max(0, -imageTop / factor);
  const side = Math.max(1, Math.min(FRAME / factor, imageWidth - originX, imageHeight - originY));
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.round(side),
    height: Math.round(side),
  };
}

/** Circle the profile photo is clipped to. Drag and pinch to choose the framing. */
export function AvatarCropper({
  uri,
  width,
  height,
  busy,
  onCancel,
  onConfirm,
}: {
  uri: string;
  width: number;
  height: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}) {
  const { colors } = useTheme();
  const cover = Math.max(FRAME / width, FRAME / height);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [error, setError] = useState<string | null>(null);

  function clampOffset(x: number, y: number, userScale: number) {
    'worklet';
    const shownWidth = width * cover * userScale;
    const shownHeight = height * cover * userScale;
    const maxX = Math.max(0, (shownWidth - FRAME) / 2);
    const maxY = Math.max(0, (shownHeight - FRAME) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      const next = clampOffset(
        savedX.value + event.translationX,
        savedY.value + event.translationY,
        scale.value,
      );
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = Math.min(4, Math.max(1, savedScale.value * event.scale));
      scale.value = nextScale;
      const next = clampOffset(translateX.value, translateY.value, nextScale);
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const imageStyle = useAnimatedStyle(() => {
    const shownWidth = width * cover * scale.value;
    const shownHeight = height * cover * scale.value;
    return {
      width: shownWidth,
      height: shownHeight,
      left: FRAME / 2 + translateX.value - shownWidth / 2,
      top: FRAME / 2 + translateY.value - shownHeight / 2,
    };
  });

  async function confirm() {
    setError(null);
    try {
      const cropped = await ImageManipulator.manipulateAsync(
        uri,
        [
          {
            crop: cropRect(width, height, cover, scale.value, translateX.value, translateY.value),
          },
          { resize: { width: 512 } },
        ],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      onConfirm(cropped.uri);
    } catch {
      setError('Não consegui recortar a foto. Tente de novo.');
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={[styles.screen, { backgroundColor: colors.background }]}>
        <AppText variant="h2">Encaixe no círculo</AppText>
        <AppText color="textSecondary">
          Arraste a foto e use dois dedos para aproximar. O que ficar dentro do círculo é a foto do
          perfil.
        </AppText>
        <View
          style={[
            styles.frame,
            { borderColor: colors.primary, backgroundColor: colors.surfaceMuted },
          ]}
        >
          <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
            <Animated.View style={[styles.photo, imageStyle]}>
              <Image source={{ uri }} style={styles.fill} contentFit="fill" />
            </Animated.View>
          </GestureDetector>
        </View>
        {error ? <AppText color="error">{error}</AppText> : null}
        <Button
          title="Usar esta foto"
          icon="check"
          fullWidth
          loading={busy}
          onPress={() => void confirm()}
        />
        <Button title="Cancelar" variant="ghost" fullWidth disabled={busy} onPress={onCancel} />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: radius.pill,
    borderWidth: 3,
    overflow: 'hidden',
  },
  photo: { position: 'absolute' },
  fill: { width: '100%', height: '100%' },
});
