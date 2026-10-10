const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailError(value: string): string | null {
  const email = normalizeEmail(value);
  if (email.length === 0) return 'Informe seu e-mail.';
  if (!EMAIL.test(email)) return 'Esse e-mail não parece válido.';
  return null;
}

export function nameError(value: string): string | null {
  if (value.trim().length < 2) return 'Como podemos te chamar?';
  return null;
}

export function passwordError(value: string): string | null {
  if (value.length === 0) return 'Informe sua senha.';
  if (value.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  return null;
}

export function confirmPasswordError(password: string, confirm: string): string | null {
  if (confirm.length === 0) return 'Repita a senha.';
  if (confirm !== password) return 'As senhas não são iguais.';
  return null;
}

export type PasswordStrength = 'empty' | 'weak' | 'medium' | 'strong';

/** Visual hint only. The real minimum is 8 characters, checked by `passwordError`. */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length === 0) return 'empty';
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}
