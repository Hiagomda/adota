#!/usr/bin/env node
// Gera os marcadores dos Parceiros do Cupu. Todos têm a mesma casinha com borda branca e sombra,
// e a ponta embaixo é o ponto da loja (iconAnchor 'bottom' no MapCanvas), igual às gotas dos
// resgates, mas o formato de casa separa os dois. O que muda é a cor e o desenho na janela:
//
//   assets/partner-pin.png          turquesa com a patinha coral (outros tipos e o selo do app)
//   assets/partner-pin-petshop.png  turquesa com a sacolinha branca (petshop, ração, banho e tosa)
//   assets/partner-pin-vet.png      azul com a cruz coral e a patinha (veterinário e clínica 24h)
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

// Cores da marca (src/theme/tokens.ts): turquesa, coral, coral escuro e o azul de informação.
const turquoise = '#1F7A7A';
const coral = '#F26B4E';
const coralDark = '#D9553A';
const blue = '#2A64AE';
const white = '#FFFFFF';

// Telhado, paredes e a ponta embaixo do centro.
const house =
  'M64 14 L108 50 Q111 53 107 56 L100 56 L100 92 Q100 98 94 98 L74 98 L64 120 L54 98 L34 98 Q28 98 28 92 L28 56 L21 56 Q17 53 20 50 Z';

/** Patinha centrada em (cx, cy), com `scale` 1 do tamanho da porta do marcador original. */
function paw(cx, cy, scale, color) {
  const s = scale;
  return `<g fill="${color}" transform="translate(${cx} ${cy}) scale(${s}) translate(-64 -73)">
    <path d="M64 70 C70 70 75 75 75 80 C75 84 71 86 68 85 C66 84.5 62 84.5 60 85 C57 86 53 84 53 80 C53 75 58 70 64 70 Z"/>
    <ellipse cx="52" cy="68" rx="3.8" ry="5" transform="rotate(-24 52 68)"/>
    <ellipse cx="59" cy="61" rx="4" ry="5.5" transform="rotate(-8 59 61)"/>
    <ellipse cx="69" cy="61" rx="4" ry="5.5" transform="rotate(8 69 61)"/>
    <ellipse cx="76" cy="68" rx="3.8" ry="5" transform="rotate(24 76 68)"/>
  </g>`;
}

// Janela branca onde fica o desenho de cada tipo.
const plate = `<rect x="42" y="53" width="44" height="39" rx="12" fill="${white}"/>`;

const inside = {
  // A patinha na porta, como sempre foi.
  generic: `<rect x="44" y="54" width="40" height="36" rx="10" fill="${white}"/>${paw(64, 73, 1, coral)}`,
  // Sacolinha de compras branca, grande, com alça e a patinha coral.
  petshop: `<path d="M53.5 62 V58.5 a10.5 10.5 0 0 1 21 0 V62" fill="none" stroke="${white}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M45 59 H83 L80.5 89 Q80.2 92 77 92 H51 Q47.8 92 47.5 89 Z" fill="${white}"/>
    <circle cx="53.5" cy="65" r="2.2" fill="${turquoise}"/>
    <circle cx="74.5" cy="65" r="2.2" fill="${turquoise}"/>
    ${paw(64, 79, 0.8, coral)}`,
  // Cruz de saúde com a patinha branca no meio.
  vet: `${plate}
    <path d="M58.5 57.5 H69.5 Q71 57.5 71 59 V65.5 H77.5 Q79 65.5 79 67 V78 Q79 79.5 77.5 79.5 H71 V86 Q71 87.5 69.5 87.5 H58.5 Q57 87.5 57 86 V79.5 H50.5 Q49 79.5 49 78 V67 Q49 65.5 50.5 65.5 H57 V59 Q57 57.5 58.5 57.5 Z" fill="${coralDark}"/>
    ${paw(64, 73, 0.5, white)}`,
};

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
    <path d="${house}" fill="${body}" stroke="${white}" stroke-width="6" stroke-linejoin="round"/>
  </g>
  ${content}
</svg>`;
}

const outputs = [
  ['partner-pin.png', pin(turquoise, inside.generic)],
  ['partner-pin-petshop.png', pin(turquoise, inside.petshop)],
  ['partner-pin-vet.png', pin(blue, inside.vet)],
];

for (const [name, svg] of outputs) {
  await sharp(Buffer.from(svg), { density: 72 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, name));
  console.log(`assets/${name}`);
}
