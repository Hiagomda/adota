/**
 * "Pix copia e cola" (BR Code estático do Banco Central) montado a partir da chave da campanha,
 * para virar QR code no app. Sem valor: quem doa escolhe quanto no app do banco. O banco mostra
 * o dono real da chave antes de pagar; o nome e a cidade aqui são só o que o padrão pede.
 * Sem import de React Native, para rodar no node:test.
 */

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como o manual do BR Code pede. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function validCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/**
 * A chave como o Pix espera: e-mail em minúsculas, CPF/CNPJ só com números, telefone com +55 e
 * aleatória (EVP) em minúsculas. Telefone de 11 dígitos que também é um CPF válido fica como CPF.
 */
export function normalizePixKey(raw: string): string {
  const key = raw.trim();
  if (key.includes('@')) return key.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
    return key.toLowerCase();
  }
  if (!/^[+\d\s().\-/]+$/.test(key)) return key;
  const digits = key.replace(/\D/g, '');
  if (key.startsWith('+')) return `+${digits}`;
  if (digits.length === 14) return digits;
  if (digits.length === 11 && validCpf(digits)) return digits;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55'))
    return `+${digits}`;
  return digits;
}

/** Sem acento e só com o que o BR Code aceita, cortado no tamanho do campo. */
function plain(text: string, max: number, fallback: string): string {
  const cleaned = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
  return cleaned || fallback;
}

/** O texto do "Pix copia e cola"; o mesmo texto vira o QR code. */
export function pixCopyPaste(input: { key: string; name: string; city: string }): string {
  const account = field('00', 'br.gov.bcb.pix') + field('01', normalizePixKey(input.key));
  const body =
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', plain(input.name, 25, 'EGUA ADOTA')) +
    field('60', plain(input.city, 15, 'BELEM')) +
    field('62', field('05', '***')) +
    '6304';
  return body + crc16(body);
}
