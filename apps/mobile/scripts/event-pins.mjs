#!/usr/bin/env node
// Gera os marcadores dos eventos da agenda no mapa. O formato é um calendarzinho com as duas
// argolas em cima, o miolo branco e a ponta embaixo do centro (iconAnchor 'bottom' no MapCanvas):
// diferente da gota dos resgates, da casinha dos parceiros e da plaquinha dos pontos solidários.
// A cor do calendário e o desenho no miolo mudam com o tipo do evento:
//
//   assets/event-pin-vaccination.png    azul com a seringa
//   assets/event-pin-neutering.png      turquesa com a tesoura
//   assets/event-pin-adoption-fair.png  coral com o coração e a patinha
//   assets/event-pin-fundraising.png    caramelo com o presente
//   assets/event-pin-community.png      turquesa escuro com as duas pessoas
//
//   node apps/mobile/scripts/event-pins.mjs
//
// Usa o sharp que o Expo já instala (node_modules hoistado); rode numa árvore com node_modules ok.
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const SIZE = 128;

// Cores da marca (src/theme/tokens.ts).
const blue = '#2A64AE';
const turquoise = '#1F7A7A';
const turquoiseDark = '#155353';
const coral = '#F26B4E';
const coralDark = '#D9553A';
const caramel = '#D98A3D';
const caramelDark = '#A8661F';
const white = '#FFFFFF';

// Calendário de cantos redondos com a ponta embaixo do centro, em (64, 122).
const body =
  'M34 22 H94 Q110 22 110 38 V92 Q110 106 96 106 H76 L64 122 L52 106 H32 Q18 106 18 92 V38 Q18 22 34 22 Z';

/** Patinha centrada em (cx, cy). */
function paw(cx, cy, scale, color) {
  return `<g fill="${color}" transform="translate(${cx} ${cy}) scale(${scale})">
    <path d="M0 -3 C6 -3 11 2 11 7 C11 11 7 13 4 12 C2 11.5 -2 11.5 -4 12 C-7 13 -11 11 -11 7 C-11 2 -6 -3 0 -3 Z"/>
    <ellipse cx="-12" cy="-5" rx="3.8" ry="5" transform="rotate(-24 -12 -5)"/>
    <ellipse cx="-5" cy="-12" rx="4" ry="5.5" transform="rotate(-8 -5 -12)"/>
    <ellipse cx="5" cy="-12" rx="4" ry="5.5" transform="rotate(8 5 -12)"/>
    <ellipse cx="12" cy="-5" rx="3.8" ry="5" transform="rotate(24 12 -5)"/>
  </g>`;
}

// Os desenhos ficam centrados em (0, 0), com uns 44 px de largura; o pin os põe no miolo.
const icons = {
  vaccination: (color) => `<g transform="rotate(-40)">
    <rect x="-27" y="-9" width="4" height="18" rx="2" fill="${color}"/>
    <rect x="-24" y="-2.5" width="10" height="5" fill="${color}"/>
    <rect x="-15" y="-11" width="3.5" height="22" rx="1.5" fill="${color}"/>
    <rect x="-12" y="-7.5" width="26" height="15" rx="3" fill="${color}"/>
    <path d="M-6 -7.5 V-1 M0 -7.5 V-1 M6 -7.5 V-1" stroke="${white}" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="-4" width="5" height="8" rx="1" fill="${color}"/>
    <rect x="19" y="-1.2" width="12" height="2.4" rx="1.2" fill="${color}"/>
  </g>`,
  neutering: (color) => `<g>
    <path d="M-4 3 L12 -19 M4 3 L-12 -19" stroke="${color}" stroke-width="5.5" stroke-linecap="round"/>
    <circle cx="-9" cy="11" r="7" fill="none" stroke="${color}" stroke-width="5"/>
    <circle cx="9" cy="11" r="7" fill="none" stroke="${color}" stroke-width="5"/>
    <circle cx="0" cy="-5" r="2.2" fill="${white}"/>
  </g>`,
  adoption_fair: (color) => `<g>
    <path d="M0 18 C-6 13 -22 3 -22 -8 C-22 -16 -16 -21 -10 -21 C-5 -21 -2 -18 0 -15 C2 -18 5 -21 10 -21 C16 -21 22 -16 22 -8 C22 3 6 13 0 18 Z" fill="${color}"/>
    ${paw(0, -2, 0.62, white)}
  </g>`,
  fundraising: (color, dark) => `<g>
    <rect x="-19" y="-6" width="38" height="24" rx="3" fill="${color}"/>
    <rect x="-22" y="-13" width="44" height="9" rx="3" fill="${dark}"/>
    <rect x="-3.5" y="-13" width="7" height="31" fill="${white}"/>
    <path d="M0 -13 C-4 -22 -15 -22 -13 -16 C-12 -13 -5 -13 0 -13 Z M0 -13 C4 -22 15 -22 13 -16 C12 -13 5 -13 0 -13 Z" fill="none" stroke="${dark}" stroke-width="3.5" stroke-linejoin="round"/>
  </g>`,
  community: (color) => `<g>
    <circle cx="-10" cy="-10" r="7" fill="${color}"/>
    <path d="M-23 14 C-23 3 -17 -1 -10 -1 C-3 -1 3 3 3 14 Z" fill="${color}"/>
    <circle cx="11" cy="-8" r="6.5" fill="${color}" stroke="${white}" stroke-width="2.5"/>
    <path d="M-1 15 C-1 5 4 1 11 1 C18 1 23 5 23 15 Z" fill="${color}" stroke="${white}" stroke-width="2.5" stroke-linejoin="round"/>
  </g>`,
};

function pin(color, dark, icon) {
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
    <path d="${body}" fill="${color}" stroke="${white}" stroke-width="6" stroke-linejoin="round"/>
  </g>
  <rect x="26" y="40" width="76" height="58" rx="10" fill="${white}"/>
  <rect x="38" y="11" width="9" height="22" rx="4.5" fill="${dark}" stroke="${white}" stroke-width="3"/>
  <rect x="81" y="11" width="9" height="22" rx="4.5" fill="${dark}" stroke="${white}" stroke-width="3"/>
  <g transform="translate(64 69)">${icon}</g>
</svg>`;
}

const outputs = [
  ['event-pin-vaccination.png', pin(blue, '#1D4A86', icons.vaccination(blue))],
  ['event-pin-neutering.png', pin(turquoise, turquoiseDark, icons.neutering(turquoise))],
  ['event-pin-adoption-fair.png', pin(coral, coralDark, icons.adoption_fair(coral))],
  ['event-pin-fundraising.png', pin(caramel, caramelDark, icons.fundraising(caramel, caramelDark))],
  ['event-pin-community.png', pin(turquoiseDark, '#0F3F3F', icons.community(turquoiseDark))],
];

for (const [name, svg] of outputs) {
  await sharp(Buffer.from(svg), { density: 72 })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, name));
  console.log(`assets/${name}`);
}
