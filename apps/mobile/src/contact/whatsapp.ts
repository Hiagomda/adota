/**
 * WhatsApp numbers on the phone side. The server validates and stores them as 55 + digits;
 * this copy only gives quick feedback in the form and builds the wa.me link.
 */

/** 55 + area code + number, or null when it is not a Brazilian phone. */
export function normalizeWhatsApp(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  if (!/^[1-9][1-9](?:9\d{8}|[2-8]\d{7})$/.test(national)) return null;
  return `55${national}`;
}

/** "(91) 98888-7777" from a stored number; anything unexpected comes back as it was. */
export function formatWhatsApp(stored: string): string {
  const national = stored.startsWith('55') ? stored.slice(2) : stored;
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(national);
  if (!match) return stored;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

/** Link that opens a conversation with the number, the first message already written. */
export function whatsappUrl(stored: string, text: string): string {
  return `https://wa.me/${stored.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
