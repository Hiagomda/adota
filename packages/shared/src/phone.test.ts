import { describe, expect, it } from 'vitest';
import { normalizeWhatsApp } from './phone.js';

describe('normalizeWhatsApp', () => {
  it('reads the ways people type a Belém mobile', () => {
    expect(normalizeWhatsApp('(91) 98888-7777')).toBe('5591988887777');
    expect(normalizeWhatsApp('91988887777')).toBe('5591988887777');
    expect(normalizeWhatsApp('+55 91 98888 7777')).toBe('5591988887777');
    expect(normalizeWhatsApp('5591988887777')).toBe('5591988887777');
  });

  it('keeps an eight-digit landline', () => {
    expect(normalizeWhatsApp('(91) 3222-1111')).toBe('559132221111');
  });

  it('refuses what is not a Brazilian phone', () => {
    expect(normalizeWhatsApp('')).toBeNull();
    expect(normalizeWhatsApp('988887777')).toBeNull();
    expect(normalizeWhatsApp('(01) 98888-7777')).toBeNull();
    expect(normalizeWhatsApp('(91) 88888-7777')).toBeNull();
    expect(normalizeWhatsApp('1 202 555 0143')).toBeNull();
    expect(normalizeWhatsApp('abc')).toBeNull();
  });
});

describe('updateMeSchema phone', () => {
  it('stores the normalized number, clears on empty and refuses junk', async () => {
    const { updateMeSchema } = await import('./domain.js');
    expect(updateMeSchema.parse({ phone: '(91) 98888-7777' }).phone).toBe('5591988887777');
    expect(updateMeSchema.parse({ phone: '' }).phone).toBeNull();
    expect(updateMeSchema.parse({ phone: null }).phone).toBeNull();
    expect(updateMeSchema.parse({}).phone).toBeUndefined();
    expect(updateMeSchema.safeParse({ phone: '123' }).success).toBe(false);
  });
});
