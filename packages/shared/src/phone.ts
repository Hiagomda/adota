/**
 * Brazilian WhatsApp number in the form wa.me expects: 55, the area code and the number,
 * digits only. Accepts what people type ("(91) 98888-7777", "+55 91 98888 7777") and returns
 * null for anything that is not a Brazilian phone.
 */
export function normalizeWhatsApp(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const national = digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  // Area code (two digits, no zero) followed by 8 digits (landline) or 9 starting with 9 (mobile).
  if (!/^[1-9][1-9](?:9\d{8}|[2-8]\d{7})$/.test(national)) return null;
  return `55${national}`;
}
