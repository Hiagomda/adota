#!/usr/bin/env node
// Gera o marcador dos Parceiros do Cupu (assets/partner-pin.png): casinha turquesa com borda
// branca, sombra e a patinha coral na porta. A ponta embaixo é o ponto da loja (iconAnchor
// 'bottom' no MapCanvas), igual às gotas dos resgates, mas o formato de casa separa os dois.
//
//   node apps/mobile/scripts/partner-pin.mjs
//
// Usa o sharp que o Expo já instala (node_modules hoistado); rode numa árvore com node_modules ok.
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZE = 128;

// Turquesa e coral da marca (src/theme/tokens.ts).
const turquoise = '#1F7A7A';
const coral = '#F26B4E';

// Telhado, paredes e a ponta embaixo do centro.
const house =
  'M64 14 L108 50 Q111 53 107 56 L100 56 L100 92 Q100 98 94 98 L74 98 L64 120 L54 98 L34 98 Q28 98 28 92 L28 56 L21 56 Q17 53 20 50 Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 128 128">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dy="3"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="${house}" fill="${turquoise}" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/>
  </g>
  <rect x="44" y="54" width="40" height="36" rx="10" fill="#FFFFFF"/>
  <g fill="${coral}">
    <path d="M64 70 C70 70 75 75 75 80 C75 84 71 86 68 85 C66 84.5 62 84.5 60 85 C57 86 53 84 53 80 C53 75 58 70 64 70 Z"/>
    <ellipse cx="52" cy="68" rx="3.8" ry="5" transform="rotate(-24 52 68)"/>
    <ellipse cx="59" cy="61" rx="4" ry="5.5" transform="rotate(-8 59 61)"/>
    <ellipse cx="69" cy="61" rx="4" ry="5.5" transform="rotate(8 69 61)"/>
    <ellipse cx="76" cy="68" rx="3.8" ry="5" transform="rotate(24 76 68)"/>
  </g>
</svg>`;

const file = path.join(assets, 'partner-pin.png');
await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toFile(file);
console.log('assets/partner-pin.png');
