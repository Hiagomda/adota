import { type ReactNode, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
} from 'react-native-safe-area-context';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const INSET_TOP = 54;
const INSET_BOTTOM = 34;

export function DeviceFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const framed = __DEV__ && width >= 720;

  const metrics = useMemo(() => {
    const scale = Math.min(1, (height - 72) / PHONE_HEIGHT, (width - 48) / PHONE_WIDTH);
    const screenWidth = Math.round(PHONE_WIDTH * scale);
    const screenHeight = Math.round(PHONE_HEIGHT * scale);
    return {
      screenWidth,
      screenHeight,
      frame: { x: 0, y: 0, width: screenWidth, height: screenHeight },
      insets: {
        top: Math.round(INSET_TOP * scale),
        bottom: Math.round(INSET_BOTTOM * scale),
        left: 0,
        right: 0,
      },
    };
  }, [width, height]);

  if (!framed) {
    return <SafeAreaProvider>{children}</SafeAreaProvider>;
  }

  return (
    <View style={styles.stage}>
      <View style={styles.bezel}>
        <View style={[styles.screen, { width: metrics.screenWidth, height: metrics.screenHeight }]}>
          <SafeAreaFrameContext.Provider value={metrics.frame}>
            <SafeAreaInsetsContext.Provider value={metrics.insets}>
              <View style={styles.app}>{children}</View>
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </View>
      </View>
      <Text style={styles.caption}>
        prévia · {PHONE_WIDTH}×{PHONE_HEIGHT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#12141a',
    gap: 12,
  },
  bezel: {
    padding: 12,
    borderRadius: 36,
    backgroundColor: '#0b0b0d',
    borderWidth: 1,
    borderColor: '#2a2a2e',
  },
  screen: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#fff',
  },
  app: { flex: 1 },
  caption: { color: '#9aa0a6', fontSize: 12 },
});
