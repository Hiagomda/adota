import type { Map as MapLibreMap } from 'maplibre-gl';
import { mapColors, serviceLimit } from './layerColors';
import { serviceCamera, serviceMask, serviceOutline } from './serviceArea';

export function limitMapToBelem(map: MapLibreMap) {
  map.setMinZoom(8.5);
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
