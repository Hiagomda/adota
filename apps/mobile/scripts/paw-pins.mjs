#!/usr/bin/env node
// Gera os marcadores do mapa (assets/paw-high|medium|low.png): gota na cor da urgência, borda
// branca, sombra e a patinha branca dentro. A ponta da gota fica no centro da base da imagem,
// que é o ponto do animal (iconAnchor 'bottom' no MapCanvas).
//
//   node apps/mobile/scripts/paw-pins.mjs
//
// Usa o sharp que o Expo já instala (node_modules hoistado); rode numa árvore com node_modules ok.
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZE = 128;

// Mesmas cores das pílulas de urgência (src/theme/tokens.ts); a média usa o caramelo da marca,
// que segura melhor a patinha branca que o amarelo de aviso.
const urgencies = {
  high: '#D64545',
  medium: '#D98A3D',
  low: '#2E9E6B',
};

const drop = 'M64 121 C55 104 26 86 26 52 A38 38 0 1 1 102 52 C102 86 73 104 64 121 Z';

function svg(color) {
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
    <path d="${drop}" fill="${color}" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>
  </g>
  <g fill="#FFFFFF">
    <path d="M64 50 C74 50 82 58 82 66 C82 73 76 76 70 74 C67 73 61 73 58 74 C52 76 46 73 46 66 C46 58 54 50 64 50 Z"/>
    <ellipse cx="44" cy="47" rx="6.5" ry="8.5" transform="rotate(-24 44 47)"/>
    <ellipse cx="55.5" cy="34" rx="7" ry="9.5" transform="rotate(-8 55.5 34)"/>
    <ellipse cx="72.5" cy="34" rx="7" ry="9.5" transform="rotate(8 72.5 34)"/>
    <ellipse cx="84" cy="47" rx="6.5" ry="8.5" transform="rotate(24 84 47)"/>
  </g>
</svg>`;
}

for (const [urgency, color] of Object.entries(urgencies)) {
  const file = path.join(assets, `paw-${urgency}.png`);
  await sharp(Buffer.from(svg(color)), { density: 72 })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`assets/paw-${urgency}.png`);
}
