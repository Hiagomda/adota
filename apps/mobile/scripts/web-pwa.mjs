// Depois do `expo export --platform web`: transforma a pasta exportada no app web que o iPhone
// instala pelo Safari (Compartilhar → Adicionar à Tela de Início). Escreve o manifest e põe no
// index.html o ícone, o nome e o modo tela cheia.
//
//   node scripts/web-pwa.mjs <pasta exportada> <caminho base, ex.: /app>

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [outDir, baseArg] = process.argv.slice(2);
if (!outDir || !baseArg) {
  console.error('uso: node scripts/web-pwa.mjs <pasta exportada> <caminho base>');
  process.exit(1);
}
const base = `/${baseArg.replace(/^\/+|\/+$/g, '')}`;
const appDir = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const release = JSON.parse(readFileSync(path.join(appDir, 'version.json'), 'utf8'));

const background = '#F3E8D2';
const manifest = {
  name: 'Égua, adota!',
  short_name: 'Égua, adota!',
  lang: 'pt-BR',
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: background,
  theme_color: background,
  icons: [
    { src: `${base}/pwa/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}/pwa/icon-512.png`, sizes: '512x512', type: 'image/png' },
  ],
};
writeFileSync(path.join(outDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

const head = [
  `<link rel="manifest" href="${base}/manifest.webmanifest" />`,
  `<link rel="apple-touch-icon" href="${base}/pwa/icon-180.png" />`,
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="Égua, adota!" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  `<meta name="theme-color" content="${background}" />`,
  `<meta name="egua-version" content="${release.version}-${release.build}" />`,
].join('\n    ');

// Aviso fora do React: no Safari do iPhone, enquanto o app não foi para a tela de início, mostra
// como fazer. Some quando aberto pela tela de início ou depois de fechar no X.
const installHint = `<div id="egua-instalar" style="display:none;position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:#173B3F;color:#F3E8D2;font:15px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)">
      <span style="flex:1">Para usar como app: toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>.</span>
      <button type="button" aria-label="Fechar" style="border:0;background:none;color:inherit;font-size:22px;line-height:1;padding:4px 6px">×</button>
    </div>
    <script>
      (function () {
        var ua = navigator.userAgent;
        var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
        var instalado = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
        var fechado = false;
        try { fechado = localStorage.getItem('egua.instalar.fechado') === '1'; } catch (e) {}
        if (!ios || instalado || fechado) return;
        var aviso = document.getElementById('egua-instalar');
        aviso.style.display = 'flex';
        aviso.querySelector('button').onclick = function () {
          aviso.remove();
          try { localStorage.setItem('egua.instalar.fechado', '1'); } catch (e) {}
        };
      })();
    </script>`;

const indexPath = path.join(outDir, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('</head>') || !html.includes('</body>')) {
  throw new Error(`${indexPath} sem </head> ou </body>`);
}
html = html
  .replace('<html lang="en">', '<html lang="pt-BR">')
  .replace('</head>', `    ${head}\n  </head>`)
  .replace('</body>', `    ${installHint}\n  </body>`);
writeFileSync(indexPath, html);
console.log(`App web pronto em ${outDir} (base ${base}, build ${release.build}).`);
