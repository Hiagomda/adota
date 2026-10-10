#!/usr/bin/env node
// Raises the build number (Android versionCode / iOS buildNumber) in version.json and keeps the
// generated native project in sync, because the local Gradle build does not run `expo prebuild`.
//
//   node scripts/bump-build.mjs            bump build, sync android/app/build.gradle if present
//   node scripts/bump-build.mjs --sync     only sync the native project with version.json
//   node scripts/bump-build.mjs --publish  also write download/version.json (what the update
//                                          notice compares against) with the current numbers
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionFile = path.join(appDir, 'version.json');
const gradleFile = path.join(appDir, 'android', 'app', 'build.gradle');
const publishedFile = path.resolve(appDir, '..', '..', 'download', 'version.json');

const args = new Set(process.argv.slice(2));
const release = JSON.parse(readFileSync(versionFile, 'utf8'));
if (typeof release.version !== 'string' || !Number.isInteger(release.build)) {
  throw new Error(`version.json must contain { version: string, build: integer }`);
}

if (!args.has('--sync')) {
  release.build += 1;
  writeFileSync(versionFile, `${JSON.stringify(release, null, 2)}\n`);
  console.log(`version.json -> ${release.version} (build ${release.build})`);
}

if (existsSync(gradleFile)) {
  const before = readFileSync(gradleFile, 'utf8');
  const after = before
    .replace(/^(\s*)versionCode\s+\d+\s*$/m, `$1versionCode ${release.build}`)
    .replace(/^(\s*)versionName\s+"[^"]*"\s*$/m, `$1versionName "${release.version}"`);
  if (!/versionCode \d+/.test(after)) throw new Error(`versionCode not found in ${gradleFile}`);
  if (after !== before) {
    writeFileSync(gradleFile, after);
    console.log(
      `android/app/build.gradle -> versionCode ${release.build}, versionName ${release.version}`,
    );
  } else {
    console.log('android/app/build.gradle already in sync');
  }
} else {
  console.log(
    'android/ not generated here; `expo prebuild` will read version.json through app.config.ts',
  );
}

if (args.has('--publish')) {
  const notes = Array.isArray(release.notes)
    ? release.notes.filter((item) => typeof item === 'string' && item.trim() !== '')
    : [];
  const published = { version: release.version, androidVersionCode: release.build, notes };
  writeFileSync(publishedFile, `${JSON.stringify(published, null, 2)}\n`);
  console.log(`download/version.json -> ${published.version} / ${published.androidVersionCode}`);
}
