import type { Map as MapLibreMap } from 'maplibre-gl';
import { MIN_MAP_ZOOM } from './cameraPolicy';
import { mapColors, serviceLimit } from './layerColors';
import { municipalityBorders, serviceCamera, serviceMask, serviceOutline } from './serviceArea';

/** Prende a câmera na área atendida (todos os municípios) com uma margem. */
export function limitMapToServiceArea(map: MapLibreMap) {
  map.setMinZoom(MIN_MAP_ZOOM);
  map.setMaxBounds([
    [serviceCamera.west, serviceCamera.south],
    [serviceCamera.east, serviceCamera.north],
  ]);
}

export function showServiceLimit(map: MapLibreMap) {
  const paint = () => {
    if (!map.isStyleLoaded() || map.getSource('service-mask')) return;
    map.addSource('service-mask', { type: 'geojson', data: serviceMask });
    map.addLayer({
      id: 'service-mask',
      type: 'fill',
      source: 'service-mask',
      paint: { 'fill-color': mapColors.outsideArea, 'fill-opacity': serviceLimit.maskOpacity },
    });
    map.addSource('municipality-borders', { type: 'geojson', data: municipalityBorders });
    map.addLayer({
      id: 'municipality-borders',
      type: 'line',
      source: 'municipality-borders',
      paint: {
        'line-color': mapColors.areaOutline,
        'line-width': 1,
        'line-opacity': 0.45,
        'line-dasharray': [3, 2],
      },
    });
    map.addSource('service-outline', { type: 'geojson', data: serviceOutline });
    map.addLayer({
      id: 'service-outline',
      type: 'line',
      source: 'service-outline',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': mapColors.areaOutline,
        'line-width': serviceLimit.lineWidth,
        'line-opacity': serviceLimit.lineOpacity,
      },
    });
  };
  if (map.isStyleLoaded()) paint();
  map.on('load', paint);
  map.on('styledata', paint);
}
