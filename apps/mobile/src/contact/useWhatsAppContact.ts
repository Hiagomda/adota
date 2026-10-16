import { useState } from 'react';
import { Linking } from 'react-native';
import { api, messageFrom } from '../api';
import { reportError } from '../crash/reporter';
import { whatsappUrl } from './whatsapp';

export interface WhatsAppContact {
  /** Asks the API for the number behind `path`, then opens WhatsApp with `text` written. */
  open: (path: string, text: string) => Promise<void>;
  /** The path being opened right now, so only that button shows a spinner. */
  busy: string | null;
}

/**
 * Talks happen on WhatsApp, outside the app. The number only comes from the API, one person at
 * a time, and only from people who chose to show it. `onError` receives a message in pt-BR.
 */
export function useWhatsAppContact(
  token: string | null,
  onError: (message: string) => void,
): WhatsAppContact {
  const [busy, setBusy] = useState<string | null>(null);

  async function open(path: string, text: string) {
    if (!token) {
      onError('Entre na sua conta para falar pelo WhatsApp.');
      return;
    }
    if (busy) return;
    setBusy(path);
    try {
      const { phone } = await api<{ phone: string }>(path, { method: 'POST', token });
      try {
        await Linking.openURL(whatsappUrl(phone, text));
      } catch (error) {
        reportError(error, { source: 'handled', where: 'contact:open-whatsapp' });
        onError('Não consegui abrir o WhatsApp. Confira se ele está instalado.');
      }
    } catch (error) {
      onError(messageFrom(error));
    } finally {
      setBusy(null);
    }
  }

  return { open, busy };
}
