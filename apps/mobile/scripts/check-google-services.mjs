// Confere o google-services.json antes do build: JSON válido, projeto egua-adota e o app Android
// app.egua.adota. Um arquivo de outro projeto ou de outro pacote compila, mas o push não chega.
// Uso: node apps/mobile/scripts/check-google-services.mjs <arquivo>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node check-google-services.mjs <google-services.json>');
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`google-services.json não é um JSON válido: ${String(error)}`);
  process.exit(1);
}

const project = parsed?.project_info?.project_id;
const hasApp = (parsed?.client ?? []).some(
  (client) => client?.client_info?.android_client_info?.package_name === 'app.egua.adota',
);
if (project !== 'egua-adota') {
  console.error(`google-services.json é do projeto "${project}", não do egua-adota.`);
  process.exit(1);
}
if (!hasApp) {
  console.error('google-services.json não tem o app Android app.egua.adota.');
  process.exit(1);
}
console.log('ok   google-services.json do egua-adota com o app app.egua.adota');
