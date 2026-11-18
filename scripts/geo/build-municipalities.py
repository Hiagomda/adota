#!/usr/bin/env python3
"""
Gera a área atendida a partir dos municípios ativos.

Lê `municipios.json` (quais municípios, em que ordem, sede e zoom) e `pa-municipios.geojson`
(contornos do IBGE de todo o Pará) e regrava as três cópias idênticas de `serviceArea.ts`
(pacote shared, app e site). Com `--migration`, escreve também a migração que grava os
contornos na tabela `municipalities` do banco.

Uso (na raiz do repositório):
  pip install shapely
  python3 scripts/geo/build-municipalities.py               # só o serviceArea.ts
  python3 scripts/geo/build-municipalities.py --migration   # e a migração nova

Precisão: a malha do IBGE foi simplificada em ~22 m. Perto da divisa entre dois municípios o
app pergunta qual é o certo (ver `municipalitiesNear`), em vez de escolher sozinho.
"""

import argparse
import json
import re
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TARGETS = [
    ROOT / 'packages/shared/src/serviceArea.ts',
    ROOT / 'apps/mobile/src/map/serviceArea.ts',
    ROOT / 'apps/web/app/mapa/serviceArea.ts',
]
MIGRATIONS = ROOT / 'apps/api/db/migrations'
DOWN = ROOT / 'apps/api/db/down'

# Margem em volta da área para a câmera (graus). Dá para ver a borda sem ver o estado inteiro.
CAMERA_MARGIN = 0.08
# Contorno desenhado: fecha furos e canais estreitos (~400 m) e simplifica (~30 m).
CLOSE = 0.0036
OUTLINE_TOLERANCE = 0.0003


def rounded(value):
    if isinstance(value, (int, float)):
        return round(value, 5)
    return [rounded(item) for item in value]


def polygons(geometry):
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return [part for part in getattr(geometry, 'geoms', []) if isinstance(part, Polygon)]


def rings(geometry):
    """Polígonos no formato [anel externo, buracos...] com [lng, lat]."""
    out = []
    for polygon in polygons(geometry):
        out.append(
            [rounded(list(polygon.exterior.coords))]
            + [rounded(list(hole.coords)) for hole in polygon.interiors]
        )
    return out


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--migration', action='store_true')
    args = parser.parse_args()

    config = json.loads((HERE / 'municipios.json').read_text(encoding='utf-8'))
    source = json.loads((HERE / 'pa-municipios.geojson').read_text(encoding='utf-8'))
    by_code = {feature['properties']['code']: feature for feature in source['features']}

    entries = []
    shapes = []
    for item in config['municipalities']:
        feature = by_code.get(item['code'])
        if feature is None:
            raise SystemExit(f"Código {item['code']} não está em pa-municipios.geojson")
        if not re.fullmatch(r'[a-z0-9-]{2,60}', item['slug']):
            raise SystemExit(f"Slug inválido: {item['slug']}")
        geometry = shape(feature['geometry']).buffer(0)
        seat = item['seat']
        if not geometry.contains(shape({'type': 'Point', 'coordinates': seat})):
            raise SystemExit(f"A sede de {item['name']} está fora do contorno")
        west, south, east, north = geometry.bounds
        entries.append(
            {
                'code': item['code'],
                'slug': item['slug'],
                'name': item['name'],
                'uf': 'PA',
                'seat': {'latitude': seat[1], 'longitude': seat[0]},
                'zoom': item['zoom'],
                'bounds': {
                    'west': round(west, 5),
                    'south': round(south, 5),
                    'east': round(east, 5),
                    'north': round(north, 5),
                },
            }
        )
        shapes.append((item, geometry))

    union = unary_union([geometry for _, geometry in shapes])
    outline_shape = (
        union.buffer(CLOSE, join_style=2).buffer(-CLOSE, join_style=2).simplify(OUTLINE_TOLERANCE)
    )
    west, south, east, north = union.bounds
    camera = {
        'west': round(west - CAMERA_MARGIN, 5),
        'south': round(south - CAMERA_MARGIN, 5),
        'east': round(east + CAMERA_MARGIN, 5),
        'north': round(north + CAMERA_MARGIN, 5),
    }
    # Divisas entre municípios: tudo que é contorno de um deles e não é a borda de fora.
    outer = union.boundary.buffer(0.0004)
    borders = unary_union([geometry.boundary for _, geometry in shapes]).difference(outer)
    border_lines = []
    for line in getattr(borders, 'geoms', [borders]):
        coords = list(line.simplify(OUTLINE_TOLERANCE).coords)
        if len(coords) >= 2:
            border_lines.append(rounded(coords))

    mask_box = [
        [camera['west'] - 1, camera['south'] - 1],
        [camera['east'] + 1, camera['south'] - 1],
        [camera['east'] + 1, camera['north'] + 1],
        [camera['west'] - 1, camera['north'] + 1],
        [camera['west'] - 1, camera['south'] - 1],
    ]
    shape_rings = rings(outline_shape)
    mask_holes = [polygon[0] for polygon in shape_rings]
    areas = {item['code']: rings(geometry) for item, geometry in shapes}
    names = [entry['name'] for entry in entries]
    coverage_text = names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' e ' + names[-1]

    text = TEMPLATE.format(
        municipalities=json.dumps(entries, ensure_ascii=False, indent=2),
        areas=compact(areas),
        camera=compact(camera),
        shape=compact(shape_rings),
        mask=compact([mask_box] + mask_holes),
        borders=compact(border_lines),
        coverage=coverage_text,
    )
    for target in TARGETS:
        target.write_text(text, encoding='utf-8')
        print(f'gravado {target.relative_to(ROOT)} ({len(text) // 1024} KB)')

    if args.migration:
        write_migration(shapes)


def write_migration(shapes):
    numbers = [int(path.name[:4]) for path in MIGRATIONS.glob('[0-9][0-9][0-9][0-9]_*.sql')]
    number = max(numbers) + 1
    name = f'{number:04d}_municipalities_area.sql'
    values = []
    for order, (item, geometry) in enumerate(shapes):
        geojson = compact({'type': 'MultiPolygon', 'coordinates': rings(geometry)})
        values.append(
            "  ('{code}', '{slug}', '{name}', 'PA', {order}, "
            "ST_SetSRID(ST_MakePoint({lng}, {lat}), 4326)::geography, "
            "ST_SetSRID(ST_GeomFromGeoJSON('{geojson}'), 4326))".format(
                code=item['code'],
                slug=item['slug'],
                name=item['name'].replace("'", "''"),
                order=order,
                lng=item['seat'][0],
                lat=item['seat'][1],
                geojson=geojson,
            )
        )
    sql = (
        '-- Gerada por scripts/geo/build-municipalities.py. Grava ou atualiza os contornos dos\n'
        '-- municípios atendidos e recalcula o município dos posts que ainda não têm um.\n'
        '-- Antes de aplicar em produção, faça o backup do banco.\n'
        'INSERT INTO municipalities (code, slug, name, uf, sort_order, seat, area) VALUES\n'
        + ',\n'.join(values)
        + '\nON CONFLICT (code) DO UPDATE SET slug = EXCLUDED.slug, name = EXCLUDED.name,\n'
        '  sort_order = EXCLUDED.sort_order, seat = EXCLUDED.seat, area = EXCLUDED.area, active = true;\n\n'
        'UPDATE posts p SET municipality_code = municipality_at(p.location)\n'
        'WHERE p.municipality_code IS NULL;\n'
    )
    (MIGRATIONS / name).write_text(sql, encoding='utf-8')
    (DOWN / name).write_text(
        '-- Os municípios ficam na tabela; desligue um com active = false pelo painel.\nSELECT 1;\n',
        encoding='utf-8',
    )
    print(f'gravado apps/api/db/migrations/{name}')


TEMPLATE = """// Gerado por scripts/geo/build-municipalities.py a partir de scripts/geo/municipios.json.
// Não edite à mão: mude o JSON e rode o script. As três cópias (shared, app e site) são iguais.
type Ring = [number, number][];
type Polygon = Ring[];

export interface Municipality {{
  /** Código IBGE de 7 dígitos. É o que o banco guarda. */
  code: string;
  slug: string;
  name: string;
  uf: 'PA';
  /** Centro da sede, onde o mapa abre quando a pessoa escolhe a cidade. */
  seat: {{ latitude: number; longitude: number }};
  zoom: number;
  /** Retângulo do município inteiro, com zona rural e ilhas. */
  bounds: {{ west: number; south: number; east: number; north: number }};
}}

export const municipalities: readonly Municipality[] = {municipalities};

/** Texto com todos os municípios atendidos, para mensagens. */
export const coverageText = '{coverage}';

/** Contorno de cada município (malha do IBGE simplificada em ~22 m), pelo código. */
const municipalityAreas: Record<string, Polygon[]> = {areas};

/** Todos os polígonos da área atendida (a soma dos municípios). */
export const servicePolygons: Polygon[] = Object.values(municipalityAreas).flat();

export const serviceCamera = {camera} as const;

/**
 * O contorno desenhado no mapa: a soma dos municípios, com canais estreitos fechados e
 * simplificada, para a linha passar uma vez só. A regra de dentro/fora usa os contornos reais.
 */
export const serviceShape: Polygon[] = {shape};

export const serviceMask = {{
  type: 'Feature' as const,
  properties: {{}},
  geometry: {{
    type: 'Polygon' as const,
    coordinates: {mask},
  }},
}};

export const serviceOutline = {{
  type: 'Feature' as const,
  properties: {{}},
  geometry: {{
    type: 'MultiLineString' as const,
    coordinates: serviceShape.flat(),
  }},
}};

/** Divisas entre os municípios atendidos, desenhadas mais fracas que a borda de fora. */
export const municipalityBorders = {{
  type: 'Feature' as const,
  properties: {{}},
  geometry: {{
    type: 'MultiLineString' as const,
    coordinates: {borders} as [number, number][][],
  }},
}};

function ringContains(ring: Ring, longitude: number, latitude: number): boolean {{
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {{
    const current = ring[index];
    const prior = ring[previous];
    if (!current || !prior) continue;
    const crosses = current[1] > latitude !== prior[1] > latitude;
    if (!crosses) continue;
    const x = ((prior[0] - current[0]) * (latitude - current[1])) / (prior[1] - current[1]) + current[0];
    if (longitude < x) inside = !inside;
  }}
  return inside;
}}

function polygonsContain(polygons: Polygon[], point: {{ latitude: number; longitude: number }}): boolean {{
  return polygons.some(
    (polygon) =>
      polygon[0] !== undefined &&
      ringContains(polygon[0], point.longitude, point.latitude) &&
      !polygon.slice(1).some((hole) => ringContains(hole, point.longitude, point.latitude)),
  );
}}

function validPoint(point: {{ latitude: number; longitude: number }}): boolean {{
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}}

/** O município atendido que contém o ponto, ou null fora da área. */
export function municipalityAt(point: {{ latitude: number; longitude: number }}): Municipality | null {{
  if (!validPoint(point)) return null;
  for (const municipality of municipalities) {{
    const {{ bounds }} = municipality;
    if (
      point.longitude < bounds.west ||
      point.longitude > bounds.east ||
      point.latitude < bounds.south ||
      point.latitude > bounds.north
    ) {{
      continue;
    }}
    if (polygonsContain(municipalityAreas[municipality.code] ?? [], point)) return municipality;
  }}
  return null;
}}

export function insideServiceArea(point: {{ latitude: number; longitude: number }}): boolean {{
  return municipalityAt(point) !== null;
}}

export function municipalityByCode(code: string | null | undefined): Municipality | null {{
  return municipalities.find((item) => item.code === code) ?? null;
}}

export function municipalityBySlug(slug: string | null | undefined): Municipality | null {{
  return municipalities.find((item) => item.slug === slug) ?? null;
}}

const METERS_PER_DEGREE = 111_320;

/** Distância aproximada, em metros, do ponto até a borda do município (0 dentro dele). */
export function distanceToMunicipalityM(
  code: string,
  point: {{ latitude: number; longitude: number }},
): number {{
  const polygons = municipalityAreas[code];
  if (!polygons || !validPoint(point)) return Number.POSITIVE_INFINITY;
  if (polygonsContain(polygons, point)) return 0;
  const scaleX = Math.cos((point.latitude * Math.PI) / 180) * METERS_PER_DEGREE;
  const px = point.longitude * scaleX;
  const py = point.latitude * METERS_PER_DEGREE;
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {{
    for (const ring of polygon) {{
      for (let index = 1; index < ring.length; index += 1) {{
        const a = ring[index - 1];
        const b = ring[index];
        if (!a || !b) continue;
        const ax = a[0] * scaleX;
        const ay = a[1] * METERS_PER_DEGREE;
        const bx = b[0] * scaleX;
        const by = b[1] * METERS_PER_DEGREE;
        const dx = bx - ax;
        const dy = by - ay;
        const length = dx * dx + dy * dy;
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
        const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
        if (distance < best) best = distance;
      }}
    }}
  }}
  return best;
}}

/** Até onde (metros) um município vizinho ainda pode ser escolhido à mão perto da divisa. */
export const BORDER_TOLERANCE_M = 1500;

/**
 * Os municípios que podem ser o certo para este ponto: o que contém o ponto primeiro e depois
 * os vizinhos a até `BORDER_TOLERANCE_M` da divisa. A malha simplificada erra perto da linha,
 * então ali a pessoa confirma. Fora da área, só os que estão perto (rio, ilha, zona rural).
 */
export function municipalitiesNear(
  point: {{ latitude: number; longitude: number }},
  maxDistanceM = BORDER_TOLERANCE_M,
): Municipality[] {{
  if (!validPoint(point)) return [];
  return municipalities
    .map((municipality) => ({{ municipality, distance: distanceToMunicipalityM(municipality.code, point) }}))
    .filter((item) => item.distance <= maxDistanceM)
    .sort((a, b) => a.distance - b.distance)
    .map((item) => item.municipality);
}}

/**
 * O município que fica gravado: o escolhido pela pessoa, se ele estiver a até
 * `BORDER_TOLERANCE_M` do ponto, ou o que contém o ponto. Null quando nenhum serve.
 */
export function resolveMunicipality(
  point: {{ latitude: number; longitude: number }},
  requestedCode?: string | null,
): Municipality | null {{
  if (requestedCode) {{
    const requested = municipalityByCode(requestedCode);
    if (requested && distanceToMunicipalityM(requested.code, point) <= BORDER_TOLERANCE_M) {{
      return requested;
    }}
  }}
  return municipalityAt(point);
}}
"""

if __name__ == '__main__':
    main()
