import type { Map as MapLibreMap } from 'maplibre-gl';
import { serviceCamera, serviceMask, serviceOutline } from './serviceArea';

const outsideArea = '#1B2B2B';
const limitGreen = '#1F8F4E';

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
      paint: { 'fill-color': outsideArea, 'fill-opacity': 0.28 },
    });
    map.addSource('service-outline', { type: 'geojson', data: serviceOutline });
    map.addLayer({
      id: 'service-outline',
      type: 'line',
      source: 'service-outline',
      paint: {
        'line-color': limitGreen,
        'line-width': 3,
      },
    });
  };
  if (map.isStyleLoaded()) paint();
  map.on('load', paint);
  map.on('styledata', paint);
}
