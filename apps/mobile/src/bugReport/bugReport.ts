import { Platform } from 'react-native';
import { appVersion } from '../appVersion';
import { deviceSummary } from '../diagnostics/snapshot';

export const BUG_MESSAGE_MIN = 5;
export const BUG_MESSAGE_MAX = 2000;

export interface BugReportBody {
  message: string;
  screen: string | null;
  appVersion: string;
  platform: string;
  device: string;
}

/** O que vai junto com o texto da pessoa: a tela, a versão do app e o aparelho. */
export function bugReportBody(message: string, screen: string | null): BugReportBody {
  return {
    message: message.trim(),
    screen: screen ? screen.slice(0, 200) : null,
    appVersion: `${appVersion.version} (${appVersion.build})`.slice(0, 40),
    platform: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
    device: deviceSummary().slice(0, 120),
  };
}

/** Mesmo aviso em texto, para mandar por e-mail quando a internet ou a conta falham. */
export function bugReportEmailText(body: BugReportBody): string {
  return [
    body.message,
    '',
    '---',
    `Tela: ${body.screen ?? 'não sei'}`,
    `Versão: ${body.appVersion}`,
    `Aparelho: ${body.device} · ${body.platform}`,
  ].join('\n');
}
