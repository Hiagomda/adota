'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPost {
  id: string;
  label: string;
  status: string;
  urgency: string;
  latitude: number;
  longitude: number;
  thumbUrl: string | null;
}

const styleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const belem: [number, number] = [-48.49, -1.455];

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Permita a localização do celular para o mapa te encontrar.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'O GPS do celular não respondeu. Confira se a localização está ligada.';
  }
  return 'O GPS demorou demais. Toque em usar minha localização.';
}

export function CityMap({ posts }: { posts: MapPost[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const locateRef = useRef<(() => void) | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(posts[0]?.id ?? null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const selected = posts.find((post) => post.id === selectedId) ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let watchId: number | null = null;
    const markers: Marker[] = [];

    void import('maplibre-gl')
      .then((maplibre) => {
        if (cancelled || !containerRef.current) return;
        try {
          const map = new maplibre.Map({
            container: containerRef.current,
            style: styleUrl,
            center: belem,
            zoom: 11,
          });
          map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
          mapRef.current = map;

          let userMarker: Marker | null = null;
          let centered = false;

          function showPosition(position: GeolocationPosition) {
            const { longitude, latitude } = position.coords;
            if (!userMarker) {
              const dot = document.createElement('div');
              dot.className = 'map-me';
              dot.title = 'Você';
              userMarker = new maplibre.Marker({ element: dot, anchor: 'center' })
                .setLngLat([longitude, latitude])
                .addTo(map);
            } else {
              userMarker.setLngLat([longitude, latitude]);
            }
            if (!centered) {
              centered = true;
              map.flyTo({ center: [longitude, latitude], zoom: 14, essential: true });
            }
            setGpsMessage(null);
          }

          function startGps() {
            if (!navigator.geolocation) {
              setGpsMessage('Este navegador não lê o GPS do celular.');
              return;
            }
            if (!window.isSecureContext) {
              setGpsMessage(
                'O celular só entrega o GPS em um endereço https. Abra o mapa pelo site seguro.',
              );
              return;
            }
            centered = false;
            const options: PositionOptions = {
              enableHighAccuracy: true,
              maximumAge: 10_000,
              timeout: 15_000,
            };
            navigator.geolocation.getCurrentPosition(
              showPosition,
              (error) => {
                setGpsMessage(locationErrorMessage(error));
              },
              options,
            );
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            watchId = navigator.geolocation.watchPosition(
              showPosition,
              (error) => {
                setGpsMessage(locationErrorMessage(error));
              },
              options,
            );
          }

          locateRef.current = startGps;
          startGps();

          for (const post of posts) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'map-marker';
            button.dataset.urgency = post.urgency;
            button.dataset.id = post.id;
            button.setAttribute('aria-label', post.label);
            button.addEventListener('click', () => setSelectedId(post.id));
            markers.push(
              new maplibre.Marker({ element: button, anchor: 'center' })
                .setLngLat([post.longitude, post.latitude])
                .addTo(map),
            );
          }
        } catch (error) {
          setMapError(error instanceof Error ? error.message : 'Não consegui abrir o mapa.');
        }
      })
      .catch((error: unknown) => {
        setMapError(error instanceof Error ? error.message : 'Não consegui abrir o mapa.');
      });

    return () => {
      cancelled = true;
      locateRef.current = null;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      for (const marker of markers) marker.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [posts]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const marker of root.querySelectorAll<HTMLButtonElement>('.map-marker')) {
      marker.classList.toggle('is-selected', marker.dataset.id === selectedId);
    }
  }, [selectedId, posts]);

  return (
    <>
      <div className="map-frame">
        <div ref={containerRef} className="map-board" />
        <button type="button" className="map-locate" onClick={() => locateRef.current?.()}>
          Usar minha localização
        </button>
      </div>
      {mapError ? <p className="map-credit">{mapError}</p> : null}
      {gpsMessage ? <p className="map-credit">{gpsMessage}</p> : null}
      <p className="map-credit">
        O ponto azul é o GPS do celular. O alerta fica a cerca de 500 metros.
      </p>
      {selected ? (
        <div className="map-card">
          <Link href={`/p/${selected.id}`} className="map-card-row">
            {selected.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.thumbUrl} alt="" />
            ) : null}
            <span>
              <strong>{selected.label}</strong>
              <small>{selected.status}</small>
            </span>
          </Link>
          <a
            className="map-open"
            href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir no Maps
          </a>
        </div>
      ) : null}
    </>
  );
}
