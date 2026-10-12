import {
  Camera,
  CircleLayer,
  Images,
  LineLayer,
  Logger,
  MapView,
  ShapeSource,
  SymbolLayer,
  UserLocation,
  type CameraRef,
  type OnPressEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from '../components/ui';
import { reportError } from '../crash/reporter';
import { ensureDeviceWatch, readDeviceFix } from '../place/deviceLocation';
import { openAppSettings, openSettingsLabel, permissionOutcome } from '../permissions';
import type { Post } from '../types';
import { radius, size, spacing, useTheme } from '../theme';
import {
  initialCameraState,
  reduceCamera,
  type CameraEvent,
  type CameraState,
  type LngLat,
} from './cameraPolicy';
import {
  belem,
  boundsMoved,
  mapStyleUrl,
  normalizeBounds,
  usableMapBounds,
  type MapBounds,
} from './geo';
import { mapColors } from './layerColors';
import { insideServiceArea, serviceCamera, serviceOutline } from './serviceArea';

const pawImages = {
  pawHigh: require('../../assets/paw-high.png') as number,
  pawMedium: require('../../assets/paw-medium.png') as number,
  pawLow: require('../../assets/paw-low.png') as number,
};

const cameraBounds = {
  ne: [serviceCamera.east, serviceCamera.north] as [number, number],
  sw: [serviceCamera.west, serviceCamera.south] as [number, number],
};

const FOLLOW_DISTANCE_M = 25;

type GpsHud = 'loading' | 'ready' | 'denied' | 'blocked' | 'disabled' | 'timeout';

// Tile cancels are normal while the camera moves. Logging each one freezes the JS thread.
Logger.setLogCallback((log) => {
  const canceled = log.tag === 'Mbgl-HttpRequest' && log.message.includes('Canceled');
  return canceled || log.level === 'info' || log.level === 'debug' || log.level === 'verbose';
});

/**
 * The blue dot. Kept apart from the camera: location ticks update this marker only.
 * `animated` stays off because AnimatedPoint crashes React Native 0.86, and the view
 * is never unmounted while the screen is alive (hiding it is what `visible` does).
 */
const UserPuck = memo(function UserPuck({ visible }: { visible: boolean }) {
  return <UserLocation visible={visible} animated={false} minDisplacement={FOLLOW_DISTANCE_M} />;
});

export function MapCanvas({
  posts,
  selectedId,
  tracking,
  controlsBottom,
  onSelect,
  onCommitBounds,
}: {
  posts: Post[];
  selectedId: string | null;
  tracking: boolean;
  /** Space left for the tab bar, or for the selected-animal card when it is open. */
  controlsBottom: number;
  onSelect: (post: Post) => void;
  /** Called when the camera settles on an area, so the paws for that view can load. */
  onCommitBounds?: (bounds: MapBounds) => void;
}) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const policy = useRef<CameraState>(initialCameraState);
  const commitRef = useRef(onCommitBounds);
  const [hud, setHud] = useState(initialCameraState);
  const [gps, setGps] = useState<GpsHud>('loading');
  const framedPin = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [styleReady, setStyleReady] = useState(false);
  const [pinsReady, setPinsReady] = useState(false);
  /** Our own camera moves are reported as user gestures on Android. Ignore those. */
  const programmaticUntil = useRef(Number.POSITIVE_INFINITY);
  const opened = useRef(false);
  const committed = useRef<MapBounds | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    commitRef.current = onCommitBounds;
  }, [onCommitBounds]);

  useEffect(() => {
    if (!styleReady) return;
    const timer = setTimeout(() => setPinsReady(true), 250);
    return () => clearTimeout(timer);
  }, [styleReady]);

  useEffect(() => {
    programmaticUntil.current = Date.now() + 1500;
    const backup = setTimeout(() => setStyleReady(true), 2000);
    return () => {
      clearTimeout(backup);
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  const apply = useCallback((event: CameraEvent) => {
    const step = reduceCamera(policy.current, event);
    const changed =
      step.state.follow !== policy.current.follow || step.state.armed !== policy.current.armed;
    policy.current = step.state;
    if (changed) setHud(step.state);
    if (step.move) {
      programmaticUntil.current = Date.now() + 1000;
      camera.current?.setCamera({
        centerCoordinate: step.move.center,
        zoomLevel: step.move.zoom,
        animationDuration: 600,
        animationMode: 'easeTo',
      });
    }
    return step;
  }, []);

  useEffect(() => {
    let active = true;
    async function readGps() {
      try {
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!active) return;
        if (!servicesOn) {
          setGps('disabled');
          apply({ type: 'gpsUnavailable' });
          return;
        }
        let permission = await Location.getForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted && permission.canAskAgain) {
          permission = await Location.requestForegroundPermissionsAsync();
        }
        if (!active) return;
        const outcome = permissionOutcome(permission);
        if (outcome !== 'granted') {
          setGps(outcome === 'blocked' ? 'blocked' : 'denied');
          apply({ type: 'gpsUnavailable' });
          return;
        }
        ensureDeviceWatch();
        let got = false;
        const found = await readDeviceFix((fix) => {
          if (!active) return;
          got = true;
          setGps('ready');
          const point: LngLat = [fix.longitude, fix.latitude];
          apply({
            type: 'gps',
            point,
            inside: insideServiceArea(fix),
          });
        });
        if (!active || got || found) return;
        setGps('timeout');
      } catch (error) {
        if (!active) return;
        const text = error instanceof Error ? error.message.toLowerCase() : '';
        if (text === 'timeout') {
          setGps('timeout');
          return;
        }
        if (!text.includes('denied') && !text.includes('unavailable')) {
          reportError(error, { source: 'handled', where: 'map:gps' });
        }
        setGps('disabled');
        apply({ type: 'gpsUnavailable' });
      }
    }
    void readGps();
    return () => {
      active = false;
    };
  }, [apply, attempt]);

  useEffect(() => {
    if (!hud.follow) return;
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: FOLLOW_DISTANCE_M },
      (position) => {
        if (!active || !policy.current.follow) return;
        const point: LngLat = [position.coords.longitude, position.coords.latitude];
        apply({
          type: 'gps',
          point,
          inside: insideServiceArea({ longitude: point[0], latitude: point[1] }),
        });
      },
    )
      .then((next) => {
        if (!active) next.remove();
        else subscription = next;
      })
      .catch((error: unknown) => {
        reportError(error, { source: 'handled', where: 'map:follow' });
      });
    return () => {
      active = false;
      subscription?.remove();
    };
  }, [apply, hud.follow]);

  useEffect(() => {
    if (!selectedId) {
      framedPin.current = null;
      apply({ type: 'dismissPin' });
      return;
    }
    if (framedPin.current === selectedId) return;
    const post = posts.find((item) => item.id === selectedId);
    if (!post) return;
    framedPin.current = selectedId;
    apply({ type: 'pin', point: [post.location.longitude, post.location.latitude] });
  }, [apply, posts, selectedId]);

  const shape = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: posts.map((post) => ({
        type: 'Feature' as const,
        id: post.id,
        properties: { id: post.id, urgency: post.urgency, selected: post.id === selectedId },
        geometry: {
          type: 'Point' as const,
          coordinates: [post.location.longitude, post.location.latitude],
        },
      })),
    }),
    [posts, selectedId],
  );

  const onRegionDidChange = useCallback<
    NonNullable<ComponentProps<typeof MapView>['onRegionDidChange']>
  >(
    (event) => {
      const [northEast, southWest] = event.properties.visibleBounds;
      const east = northEast?.[0];
      const north = northEast?.[1];
      const west = southWest?.[0];
      const south = southWest?.[1];
      if (west === undefined || south === undefined || east === undefined || north === undefined) {
        return;
      }
      const bounds = normalizeBounds({ west, south, east, north });
      const fromUser =
        event.properties.isUserInteraction === true &&
        opened.current &&
        Date.now() > programmaticUntil.current;
      opened.current = true;
      apply({ type: 'region', bounds, fromUser });
      if (!usableMapBounds(bounds) || !boundsMoved(committed.current, bounds)) return;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        committed.current = bounds;
        commitRef.current?.(bounds);
      }, 350);
    },
    [apply],
  );

  const onPinPress = useCallback(
    (event: OnPressEvent) => {
      const id = event.features[0]?.properties?.id;
      if (typeof id !== 'string') return;
      const post = posts.find((item) => item.id === id);
      if (post) onSelect(post);
    },
    [onSelect, posts],
  );

  async function onLocate() {
    if (gps === 'blocked' || gps === 'denied') {
      await openAppSettings();
      return;
    }
    if (gps === 'timeout') {
      setGps('loading');
      setAttempt((value) => value + 1);
      return;
    }
    if (gps === 'disabled') {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
          return;
        } catch (error) {
          reportError(error, { source: 'handled', where: 'map:enable-gps' });
        }
      }
      await openAppSettings();
      return;
    }
    apply({ type: 'locate' });
  }

  const gpsHint =
    gps === 'denied'
      ? 'Sem a localização, o mapa abre em Belém.'
      : gps === 'blocked'
        ? 'A localização está bloqueada. O mapa abre em Belém.'
        : gps === 'disabled'
          ? 'O GPS está desligado. O mapa abre em Belém.'
          : gps === 'timeout'
            ? 'O GPS demorou. Toque no alvo para tentar de novo.'
            : null;

  const locateLabel = hud.follow
    ? 'Parar de seguir minha localização'
    : gps === 'blocked' || gps === 'denied'
      ? openSettingsLabel
      : gps === 'loading' || gps === 'timeout'
        ? 'Buscando sua localização'
        : 'Minha localização';

  return (
    <View style={styles.fill}>
      <MapView
        style={styles.fill}
        mapStyle={mapStyleUrl}
        attributionEnabled={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onDidFinishLoadingStyle={() => setStyleReady(true)}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={camera}
          minZoomLevel={8.5}
          maxBounds={cameraBounds}
          defaultSettings={{ centerCoordinate: belem, zoomLevel: 12 }}
        />
        <ShapeSource id="service-outline" shape={serviceOutline}>
          <LineLayer
            id="service-outline-line"
            style={{
              lineColor: mapColors.areaOutline,
              lineWidth: 3,
              lineJoin: 'round',
              lineCap: 'round',
            }}
          />
        </ShapeSource>
        {gps === 'ready' ? <UserPuck visible={tracking} /> : null}
        {styleReady ? <Images images={pawImages} /> : null}
        {pinsReady ? (
          <ShapeSource id="alerts" shape={shape} onPress={onPinPress}>
            <CircleLayer
              id="pin-hit"
              style={{
                circleRadius: 36,
                circleColor: '#000000',
                circleOpacity: 0.01,
              }}
            />
            <SymbolLayer
              id="pins"
              style={{
                iconImage: [
                  'match',
                  ['get', 'urgency'],
                  'high',
                  'pawHigh',
                  'medium',
                  'pawMedium',
                  'low',
                  'pawLow',
                  'pawMedium',
                ],
                iconSize: ['case', ['==', ['get', 'selected'], true], 0.62, 0.55],
                iconAllowOverlap: true,
                iconIgnorePlacement: true,
              }}
            />
          </ShapeSource>
        ) : null}
      </MapView>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {gpsHint ? (
          <View
            pointerEvents="none"
            style={[styles.hint, { top: insets.top + spacing.md, backgroundColor: colors.surface }]}
          >
            <AppText variant="caption">{gpsHint}</AppText>
          </View>
        ) : null}
        <View pointerEvents="box-none" style={[styles.locate, { bottom: controlsBottom }]}>
          <View style={[styles.locateButton, shadows.md, { backgroundColor: colors.surface }]}>
            <IconButton
              icon="crosshair"
              variant={hud.follow ? 'filled' : 'tonal'}
              accessibilityLabel={locateLabel}
              onPress={() => void onLocate()}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hint: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locate: { position: 'absolute', right: spacing.lg },
  locateButton: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
