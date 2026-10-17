#!/usr/bin/env node
// Confere um APK de release antes de publicar. O build 22 saiu sem as chaves do Firebase e do
// Google e o build 23 sem HTTP liberado no manifest; os dois chegaram aos celulares. Isto barra aqui.
//
//   node apps/mobile/scripts/check-apk.mjs <app-release.apk> [--env apps/mobile/.env] [--offline]
//
// Os valores do .env são comparados, nunca impressos. EXPECTED_SIGNER_SHA256 (hex, com ou sem dois
// pontos) fixa a chave de assinatura; sem ele o digest é impresso para poder ser fixado.
// Precisa do build-tools do Android SDK (ANDROID_HOME, ANDROID_SDK_ROOT ou o padrão do Windows).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apk = args.find((arg) => !arg.startsWith('--'));
const envIndex = args.indexOf('--env');
const envFile = envIndex >= 0 ? args[envIndex + 1] : path.join(appDir, '.env');
const offline = args.includes('--offline');

/** Valores que o app grava no bundle JS. A mesma lista barra o build de release no app.config.ts. */
const bakedIn = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_DOWNLOAD_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

const failures = [];
function check(ok, label, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures.push(label);
}

function readEnv(file) {
  const values = { ...process.env };
  if (file && existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

function buildTools() {
  const sdk =
    process.env.ANDROID_HOME ||
    process.env.ANDROID_SDK_ROOT ||
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  const root = path.join(sdk, 'build-tools');
  if (!existsSync(root)) throw new Error(`Android build-tools not found under ${sdk}`);
  const latest = readdirSync(root).sort().at(-1);
  return path.join(root, latest);
}

function tool(dir, name, toolArgs) {
  if (process.platform !== 'win32') {
    return execFileSync(path.join(dir, name), toolArgs, { encoding: 'utf8' });
  }
  // No Windows o apksigner é um .bat, que só o cmd.exe executa.
  if (name === 'apksigner') {
    return execFileSync('cmd.exe', ['/d', '/c', path.join(dir, 'apksigner.bat'), ...toolArgs], {
      encoding: 'utf8',
    });
  }
  return execFileSync(path.join(dir, `${name}.exe`), toolArgs, { encoding: 'utf8' });
}

/** Lê um arquivo de dentro do APK (um zip) sem extrair tudo. */
function zipEntry(zip, wanted) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  let offset = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : inflateRawSync(data);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

async function reachable(url, expect) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = await response.text();
    return response.ok && (!expect || expect(body));
  } catch {
    return false;
  }
}

if (!apk || !existsSync(apk)) {
  console.error('uso: node apps/mobile/scripts/check-apk.mjs <app-release.apk> [--env arquivo]');
  process.exit(2);
}

const env = readEnv(envFile);
const release = JSON.parse(readFileSync(path.join(appDir, 'version.json'), 'utf8'));
const tools = buildTools();

const badging = tool(tools, 'aapt2', ['dump', 'badging', apk]);
const versionCode = Number(/versionCode='(\d+)'/.exec(badging)?.[1]);
check(
  versionCode === release.build,
  'versionCode igual ao version.json',
  `${versionCode} vs ${release.build}`,
);
check(/package: name='app\.egua\.adota'/.test(badging), 'pacote é app.egua.adota');

const manifest = tool(tools, 'aapt2', ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
const cleartext = /usesCleartextTraffic\([^)]*\)=true/.test(manifest);
const plainHttp = /^http:\/\//.test(env.EXPO_PUBLIC_API_URL ?? '');
check(
  !plainHttp || cleartext,
  'HTTP liberado enquanto a API é http://',
  plainHttp ? 'API em http' : 'API em https',
);
check(!/android:debuggable\([^)]*\)=true/.test(manifest), 'não é build de debug');

const certs = tool(tools, 'apksigner', ['verify', '--print-certs', apk]);
const signer = /SHA-256 digest: ([0-9a-f]+)/i.exec(certs)?.[1]?.toLowerCase() ?? '';
const expected = (env.EXPECTED_SIGNER_SHA256 ?? '').replace(/:/g, '').toLowerCase();
if (expected) check(signer === expected, 'assinado com a chave esperada');
else console.log(`info SHA-256 da assinatura ${signer} (defina EXPECTED_SIGNER_SHA256 para fixar)`);

const bundle = zipEntry(readFileSync(apk), 'assets/index.android.bundle');
check(Boolean(bundle), 'bundle JS presente');
if (bundle) {
  // O Hermes guarda texto ASCII como bytes e o resto em UTF-16; os valores do .env são ASCII.
  const text = bundle.toString('latin1');
  for (const name of bakedIn) {
    const value = env[name]?.trim();
    check(Boolean(value) && text.includes(value), `${name} gravado no app`);
  }
}

if (!offline) {
  const api = (env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  check(
    await reachable(`${api}/health`, (body) => body.includes('"ok"')),
    'API /health responde ok',
  );
  const download = (env.EXPO_PUBLIC_DOWNLOAD_URL ?? '').replace(/\/$/, '');
  check(await reachable(`${download}/version.json`), 'version.json da página de download responde');
}

if (failures.length > 0) {
  console.error(`\n${failures.length} verificação(ões) falharam. Não publique este APK.`);
  process.exit(1);
}
console.log('\nAPK pronto para publicar.');
