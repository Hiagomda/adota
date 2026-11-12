#!/usr/bin/env node
// Gera os marcadores dos pontos solidários de ração e água. O formato é uma plaquinha quadrada com
// a ponta curta embaixo (iconAnchor 'bottom' no MapCanvas): diferente da gota dos resgates e da casinha
// dos parceiros, para ninguém confundir pote na rua com animal ou loja.
//
//   assets/feed-point-food.png   caramelo com o potinho de ração
//   assets/feed-point-water.png  azul com a gota d'água
//   assets/feed-point-both.png   caramelo com o potinho e a gota azul ao lado
//
//   node apps/mobile/scripts/feed-point-pins.mjs
//
// Usa o sharp que o Expo já instala (node_modules hoistado); rode numa árvore com node_modules ok.
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZE = 128;

// Cores da marca (src/theme/tokens.ts): caramelo, coral, o azul de informação e o creme.
const caramel = '#D98A3D';
const caramelDark = '#A9662A';
const blue = '#2A64AE';
const coral = '#F26B4E';
const white = '#FFFFFF';

// Plaquinha quadrada de cantos redondos com uma ponta curta embaixo do centro, em (64, 120).
const balloon =
  'M38 18 H90 Q108 18 108 36 V84 Q108 102 90 102 H76 L64 120 L52 102 H38 Q20 102 20 84 V36 Q20 18 38 18 Z';

// Potinho: tigela branca com grãos de ração por cima.
function bowl(cx, cy, scale) {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">
    <circle cx="-9" cy="-9" r="5" fill="${caramelDark}"/>
    <circle cx="1" cy="-12" r="5" fill="${caramelDark}"/>
    <circle cx="10" cy="-8" r="5" fill="${caramelDark}"/>
    <circle cx="-3" cy="-4" r="4.5" fill="${caramelDark}"/>
    <path d="M-24 -4 H24 Q24 18 0 18 Q-24 18 -24 -4 Z" fill="${white}"/>
    <rect x="-14" y="16" width="28" height="5" rx="2.5" fill="${white}"/>
    <rect x="-16" y="2" width="32" height="4" rx="2" fill="${coral}"/>
  </g>`;
}

function drop(cx, cy, scale, fill, shine) {
  return `<g transform="translate(${cx} ${cy}) scale(${scale})">
    <path d="M0 -24 C10 -10 18 -1 18 9 A18 18 0 0 1 -18 9 C-18 -1 -10 -10 0 -24 Z" fill="${fill}"/>
    <path d="M-8 6 Q-8 14 -1 17" stroke="${shine}" stroke-width="4" stroke-linecap="round" fill="none"/>
  </g>`;
}

function pin(body, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 128 128">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="${balloon}" fill="${body}" stroke="${white}" stroke-width="6" stroke-linejoin="round"/>
  </g>
  ${content}
</svg>`;
}

const outputs = [
  ['feed-point-food.png', pin(caramel, bowl(64, 62, 1.15))],
  ['feed-point-water.png', pin(blue, drop(64, 60, 1.25, white, blue))],
  [
    'feed-point-both.png',
    pin(
      caramel,
      `${bowl(56, 66, 0.95)}
       <circle cx="86" cy="40" r="17" fill="${white}"/>
       ${drop(86, 41, 0.6, blue, white)}`,
    ),
  ],
];

for (const [name, svg] of outputs) {
  await sharp(Buffer.from(svg), { density: 72 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, name));
  console.log(`assets/${name}`);
}
