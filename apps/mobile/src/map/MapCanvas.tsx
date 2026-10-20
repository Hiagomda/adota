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
  type RefObject,
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
  cameraFramesPoint,
  mapStyleUrl,
  normalizeBounds,
  usableMapBounds,
  type BoundsOrigin,
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

// Constante de módulo: um objeto novo a cada render faria a <Camera> renderizar de novo.
const defaultCamera = { centerCoordinate: belem, zoomLevel: 12 };

/** Duração dos movimentos do próprio app (primeiro centro, "Minha localização", pata escolhida). */
const MOVE_MS = 600;

/**
 * Destino neutro: sem centro nem zoom, o MapLibre usa a câmera atual e não anda. Fica gravado
 * depois que cada movimento do app termina, para que uma reaplicação da prop `stop` pelo nativo
 * não leve o mapa a lugar nenhum.
 */
const NEUTRAL_STOP = { animationDuration: 0, animationMode: 'moveTo' } as const;

// Estilos das camadas fora do render: um objeto novo a cada render manda o estilo de novo ao
// nativo, que redesenha as patas no meio do arrasto.
const outlineStyle: ComponentProps<typeof LineLayer>['style'] = {
  lineColor: mapColors.areaOutline,
  lineWidth: 3,
  lineJoin: 'round',
  lineCap: 'round',
};
// Área de toque sobre a cabeça da gota, que fica acima do ponto (scripts/paw-pins.mjs).
const hitStyle: ComponentProps<typeof CircleLayer>['style'] = {
  circleRadius: 32,
  circleColor: mapColors.hitArea,
  circleOpacity: 0.01,
  circleTranslate: [0, -44],
};
const pinStyle: ComponentProps<typeof SymbolLayer>['style'] = {
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
  iconSize: 0.6,
  // A ponta da gota é o ponto do animal.
  iconAnchor: 'bottom',
  iconAllowOverlap: true,
  iconIgnorePlacement: true,
};

const PUCK_DISTANCE_M = 25;

type GpsHud = 'loading' | 'ready' | 'denied' | 'blocked' | 'disabled' | 'timeout';

// Cancelar tiles é normal enquanto a câmera anda. Registrar cada um trava a thread do JS.
Logger.setLogCallback((log) => {
  const canceled = log.tag === 'Mbgl-HttpRequest' && log.message.includes('Canceled');
  return canceled || log.level === 'info' || log.level === 'debug' || log.level === 'verbose';
});

/**
 * O ponto azul. Fica separado da câmera: cada nova posição só atualiza este marcador.
 * `animated` fica desligado porque o AnimatedPoint derruba o React Native 0.86, e a view
 * nunca sai da árvore enquanto a tela vive (esconder é papel do `visible`).
 */
const UserPuck = memo(function UserPuck({ visible }: { visible: boolean }) {
  return <UserLocation visible={visible} animated={false} minDisplacement={PUCK_DISTANCE_M} />;
});

/**
 * A câmera nunca renderiza de novo depois de montada. Cada render dela manda as props ao nativo,
 * e o Android reaplicava junto o último `stop` gravado pelo setCamera: no meio de um arrasto, o
 * mapa pulava de volta para onde estava antes (as "teleportadas"). Só o ref a move.
 */
const StableCamera = memo(function StableCamera({
  cameraRef,
}: {
  cameraRef: RefObject<CameraRef | null>;
}) {
  return (
    <Camera
      ref={cameraRef}
      minZoomLevel={8.5}
      maxBounds={cameraBounds}
      defaultSettings={defaultCamera}
    />
  );
});

export function MapCanvas({
  posts,
  selectedId,
  tracking,
  controlsBottom,
  onSelect,
  onDismiss,
  onCommitBounds,
  focus,
}: {
  posts: Post[];
  selectedId: string | null;
  tracking: boolean;
  /** Espaço da barra de abas, ou do card do animal selecionado quando ele está aberto. */
  controlsBottom: number;
  onSelect: (post: Post) => void;
  /** Toque no mapa, fora de uma pata, fecha o card selecionado. */
  onDismiss?: () => void;
  /** Chamado quando a câmera para numa área, para carregar as patas dessa vista. */
  onCommitBounds?: (bounds: MapBounds, origin: BoundsOrigin) => void;
  /** Abre a câmera neste pino, antes do centro pelo GPS. */
  focus?: LngLat | null;
}) {
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const policy = useRef<CameraState>(initialCameraState);
  const commitRef = useRef(onCommitBounds);
  const dismissRef = useRef(onDismiss);
  const pressedPin = useRef(false);
  const [gps, setGps] = useState<GpsHud>('loading');
  const framedPin = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [styleReady, setStyleReady] = useState(false);
  const [sprite, setSprite] = useState(0);
  // As patas montam um instante depois de cada sprite, para o MapLibre ter as imagens antes de desenhar.
  const [pinsSprite, setPinsSprite] = useState<number | null>(null);
  const pinsReady = styleReady && pinsSprite === sprite;
  const focusRef = useRef(focus);
  const trackingRef = useRef(tracking);
  const landed = useRef(false);
  const lastKick = useRef(0);
  /** Quando a pessoa tocou no mapa pela última vez. Depois disso, o pino pedido para de insistir. */
  const touchedAt = useRef(0);
  const focusAt = useRef(0);
  /** No Android, os movimentos do próprio app chegam como gesto da pessoa. Estes são ignorados. */
  const programmaticUntil = useRef(Number.POSITIVE_INFINITY);
  const opened = useRef(false);
  const committed = useRef<MapBounds | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Um gesto dentro da janela de espera faz da área onde o mapa parou uma escolha da pessoa. */
  const userMoved = useRef(false);
  /**
   * Quando o último movimento do app termina. O setCamera do MapLibre vira prop nativa (`stop`) e,
   * na New Architecture, o Android pode reaplicá-la depois sem ninguém pedir. Assim que o movimento
   * acaba, o destino gravado vira o neutro (NEUTRAL_STOP). Antes, o app regravava a vista onde a
   * pessoa parava; quando essa ordem chegava atrasada, já com o dedo num novo arrasto, o mapa
   * voltava para trás.
   */
  const moveEndsAt = useRef<number | null>(null);

  useEffect(() => {
    commitRef.current = onCommitBounds;
    dismissRef.current = onDismiss;
    focusRef.current = focus;
    trackingRef.current = tracking;
  }, [focus, onCommitBounds, onDismiss, tracking]);

  const sawTracking = useRef(tracking);
  useEffect(() => {
    if (tracking && !sawTracking.current) setSprite((value) => value + 1);
    sawTracking.current = tracking;
  }, [tracking]);

  useEffect(() => {
    if (!styleReady) return;
    const timer = setTimeout(() => setPinsSprite(sprite), 250);
    return () => clearTimeout(timer);
  }, [styleReady, sprite]);

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
    policy.current = step.state;
    if (step.move) {
      programmaticUntil.current = Date.now() + 1000;
      moveEndsAt.current = Date.now() + MOVE_MS;
      camera.current?.setCamera({
        centerCoordinate: step.move.center,
        zoomLevel: step.move.zoom,
        animationDuration: MOVE_MS,
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
          // Um pino pedido por "Ver no mapa" vence o primeiro centro, mas só até aparecer na tela:
          // posições seguintes não podem puxar a câmera de volta para ele.
          const pending = focusRef.current;
          if (pending && !landed.current) apply({ type: 'pin', point: pending });
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

  // setCamera antes do estilo existir, ou com a aba congelada, é ignorado.
  // O centro padrão é Belém, então insiste quando o mapa estiver de fato na tela.
  useEffect(() => {
    landed.current = false;
    focusAt.current = Date.now();
  }, [focus]);

  useEffect(() => {
    if (!focus || !styleReady || !tracking) return;
    const point = focus;
    const kick = () => {
      // A pessoa já mexeu no mapa: ela manda na câmera, o pino não puxa de volta.
      if (landed.current || touchedAt.current > focusAt.current) return;
      lastKick.current = Date.now();
      apply({ type: 'pin', point });
    };
    kick();
    const timers = [600, 1400, 2400].map((delay) => setTimeout(kick, delay));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [apply, focus, styleReady, tracking]);

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

  // Os mesmos dados de patas precisam manter o mesmo objeto GeoJSON. Um array novo a cada
  // render do pai apaga os ícones no Android até o estilo desenhá-los de novo.
  const pinKey = posts
    .map(
      (post) =>
        `${post.id}:${post.location.longitude.toFixed(5)}:${post.location.latitude.toFixed(5)}:${post.urgency}`,
    )
    .sort()
    .join('|');
  const shape = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: posts.map((post) => ({
        type: 'Feature',
        id: post.id,
        properties: { id: post.id, urgency: post.urgency },
        geometry: {
          type: 'Point',
          coordinates: [post.location.longitude, post.location.latitude],
        },
      })),
    }),
    // O pinKey já lista todos os campos desenhados no mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinKey],
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
      if (fromUser) userMoved.current = true;
      apply({ type: 'region', bounds, fromUser });
      // O movimento do app já terminou (ou a pessoa o interrompeu): troca o destino gravado
      // pelo neutro. Antes do fim, isso cortaria a animação no meio.
      const endsAt = moveEndsAt.current;
      if (endsAt !== null && Date.now() >= endsAt) {
        moveEndsAt.current = null;
        camera.current?.setCamera(NEUTRAL_STOP);
      }
      const aim = focusRef.current;
      if (aim) {
        const framed = cameraFramesPoint(bounds, { longitude: aim[0], latitude: aim[1] });
        if (framed) landed.current = true;
        else if (
          !landed.current &&
          trackingRef.current &&
          touchedAt.current <= focusAt.current &&
          Date.now() > lastKick.current + 700
        ) {
          lastKick.current = Date.now();
          apply({ type: 'pin', point: aim });
        }
      }
      if (!usableMapBounds(bounds) || !boundsMoved(committed.current, bounds)) return;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        committed.current = bounds;
        const origin = { fromUser: userMoved.current };
        userMoved.current = false;
        commitRef.current?.(bounds, origin);
      }, 350);
    },
    [apply],
  );

  const onPinPress = useCallback(
    (event: OnPressEvent) => {
      const id = event.features[0]?.properties?.id;
      if (typeof id !== 'string') return;
      const post = posts.find((item) => item.id === id);
      if (!post) return;
      // O toque no mapa também dispara. A marca faz esse toque manter o card aberto.
      pressedPin.current = true;
      onSelect(post);
    },
    [onSelect, posts],
  );

  const onMapPress = useCallback(() => {
    setTimeout(() => {
      if (pressedPin.current) {
        pressedPin.current = false;
        return;
      }
      dismissRef.current?.();
    }, 40);
  }, []);

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

  const locateLabel =
    gps === 'blocked' || gps === 'denied'
      ? openSettingsLabel
      : gps === 'loading' || gps === 'timeout'
        ? 'Buscando sua localização'
        : 'Minha localização';

  return (
    // Qualquer toque no mapa entrega a câmera à pessoa, mesmo quando o Android não marca a
    // mudança de câmera como gesto.
    <View
      style={styles.fill}
      onTouchStart={() => {
        touchedAt.current = Date.now();
        apply({ type: 'gesture' });
      }}
    >
      <MapView
        style={styles.fill}
        mapStyle={mapStyleUrl}
        attributionEnabled={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onDidFinishLoadingStyle={() => setStyleReady(true)}
        onPress={onMapPress}
        onRegionDidChange={onRegionDidChange}
      >
        <StableCamera cameraRef={camera} />
        <ShapeSource id="service-outline" shape={serviceOutline}>
          <LineLayer id="service-outline-line" style={outlineStyle} />
        </ShapeSource>
        {gps === 'ready' ? <UserPuck visible={tracking} /> : null}
        {styleReady ? <Images key={sprite} images={pawImages} /> : null}
        {pinsReady ? (
          <ShapeSource key={sprite} id="alerts" shape={shape} onPress={onPinPress}>
            <CircleLayer id="pin-hit" style={hitStyle} />
            <SymbolLayer id="pins" style={pinStyle} />
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
              variant="tonal"
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
