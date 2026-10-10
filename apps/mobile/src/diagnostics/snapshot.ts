import { Platform } from 'react-native';
import { apiUrl } from '../api';
import { appVersion, formatAppVersion, releaseName, type AppEnvironment } from '../appVersion';
import { sentryDsn } from '../crash/reporter';
import { downloadPageUrl } from '../updates/checkForAppUpdate';

const environmentLabel: Record<AppEnvironment, string> = {
  development: 'desenvolvimento',
  preview: 'teste',
  production: 'produção',
};

function androidConstants(): {
  brand: string | null;
  model: string | null;
  release: string | null;
} {
  const constants = Platform.constants as {
    Brand?: unknown;
    Model?: unknown;
    Release?: unknown;
  };
  return {
    brand: typeof constants.Brand === 'string' ? constants.Brand : null,
    model: typeof constants.Model === 'string' ? constants.Model : null,
    release: typeof constants.Release === 'string' ? constants.Release : null,
  };
}

/** Human-readable device line. No advertising or vendor ids — those identify the person, not the APK. */
export function deviceSummary(): string {
  if (Platform.OS === 'android') {
    const { brand, model, release } = androidConstants();
    const name = [brand, model].filter((part): part is string => Boolean(part)).join(' ');
    if (name && release) return `${name} (Android ${release})`;
    if (name) return name;
    if (release) return `Android ${release}`;
    return `Android ${String(Platform.Version)}`;
  }
  if (Platform.OS === 'ios') return `iOS ${String(Platform.Version)}`;
  return Platform.OS;
}

export interface DiagnosticRow {
  label: string;
  value: string;
}

/**
 * Fields a tester can copy to identify exactly which APK, device and API they are on.
 * Tokens, DSN and handles stay out: this text is meant to be pasted in a chat.
 */
export function diagnosticRows(): DiagnosticRow[] {
  return [
    { label: 'App', value: formatAppVersion() },
    { label: 'Release', value: releaseName() },
    { label: 'Ambiente', value: environmentLabel[appVersion.environment] },
    { label: 'Pacote', value: appVersion.applicationId ?? 'desconhecido' },
    { label: 'Commit', value: appVersion.commit ?? 'desconhecido' },
    { label: 'Compilado', value: appVersion.builtAt ?? 'desconhecido' },
    { label: 'Plataforma', value: `${Platform.OS} ${String(Platform.Version)}` },
    { label: 'Aparelho', value: deviceSummary() },
    { label: 'API', value: apiUrl },
    { label: 'Download', value: downloadPageUrl },
    { label: 'Sentry', value: sentryDsn ? 'ligado' : 'desligado' },
  ];
}

export function diagnosticText(): string {
  const lines = diagnosticRows().map((row) => `${row.label}: ${row.value}`);
  return ['Égua, adota! diagnóstico', ...lines].join('\n');
}
