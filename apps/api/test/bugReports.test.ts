import { describe, expect, it } from 'vitest';
import { bugReportSchema } from '../src/bugReports.js';

describe('bugReportSchema', () => {
  it('aceita o aviso com os dados do aparelho', () => {
    const parsed = bugReportSchema.parse({
      message: '  O mapa fechou sozinho quando toquei na pata  ',
      screen: '/explore',
      appVersion: '0.1.0 (44)',
      platform: 'android 14',
      device: 'Samsung SM-A155M',
    });
    expect(parsed.message).toBe('O mapa fechou sozinho quando toquei na pata');
    expect(parsed.screen).toBe('/explore');
  });

  it('pede um texto de pelo menos 5 letras', () => {
    const parsed = bugReportSchema.safeParse({ message: 'oi' });
    expect(parsed.success).toBe(false);
  });

  it('transforma campos vazios em nulo e recusa campos desconhecidos', () => {
    expect(bugReportSchema.parse({ message: 'Travou ao publicar', screen: '' }).screen).toBe(null);
    expect(bugReportSchema.safeParse({ message: 'Travou ao publicar', x: 1 }).success).toBe(false);
  });
});
