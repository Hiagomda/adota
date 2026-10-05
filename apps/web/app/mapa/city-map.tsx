'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export interface MapPost {
  id: string;
  label: string;
  status: string;
  urgency: string;
  latitude: number;
  longitude: number;
  thumbUrl: string | null;
}

const bounds = { minLng: -48.56, maxLng: -48.4, minLat: -1.52, maxLat: -1.28 };

export function CityMap({ posts }: { posts: MapPost[] }) {
  const groups = useMemo(() => cluster(posts), [posts]);
  const [selectedId, setSelectedId] = useState<string | null>(groups[0]?.id ?? null);
  const selected = groups.find((group) => group.id === selectedId) ?? null;

  return (
    <>
      <div className="map-board">
        {groups.map((group) => {
          const x = (group.longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng);
          const y = (bounds.maxLat - group.latitude) / (bounds.maxLat - bounds.minLat);
          if (x < 0 || x > 1 || y < 0 || y > 1) return null;
          return (
            <button
              key={group.id}
              type="button"
              className={`map-pin ${group.urgency}`}
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              aria-label={group.posts.length > 1 ? `${group.posts.length} alertas` : group.label}
              onClick={() => setSelectedId(group.id)}
            >
              {group.posts.length > 1 ? group.posts.length : ''}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="map-card">
          {selected.posts.map((post) => (
            <Link key={post.id} href={`/p/${post.id}`} className="map-card-row">
              {post.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.thumbUrl} alt="" />
              ) : null}
              <span>
                <strong>{post.label}</strong>
                <small>{post.status}</small>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}

function cluster(posts: MapPost[]) {
  const buckets = new Map<string, MapPost[]>();
  for (const post of posts) {
    const key = `${Math.round(post.latitude / 0.008)}:${Math.round(post.longitude / 0.008)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), post]);
  }
  return [...buckets.entries()].map(([id, group]) => {
    const first = group[0];
    return {
      id,
      urgency: group.some((post) => post.urgency === 'high') ? 'high' : (first?.urgency ?? 'low'),
      latitude: average(group.map((post) => post.latitude)),
      longitude: average(group.map((post) => post.longitude)),
      label: first?.label ?? 'Alerta',
      posts: group,
    };
  });
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
