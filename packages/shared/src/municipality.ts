import { z } from 'zod';
import { foldText } from './lostMatch.js';
import { municipalities, municipalityByCode, municipalityBySlug } from './serviceArea.js';

/** Códigos dos municípios atendidos cujo nome contém o texto buscado ("castanhal", "barca"). */
export function municipalityCodesMatching(text: string): string[] {
  const wanted = foldText(text).trim();
  if (wanted.length < 3) return [];
  return municipalities
    .filter((item) => foldText(item.name).includes(wanted) || item.slug.includes(wanted))
    .map((item) => item.code);
}

/**
 * Município pedido num filtro: aceita o código IBGE ou o slug ("castanhal") e devolve o código.
 * Município fora da lista atendida é erro de validação, nunca um filtro que traz tudo.
 */
export const municipalityParamSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .transform((value, context) => {
    const found = municipalityByCode(value) ?? municipalityBySlug(foldText(value));
    if (!found) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Município não atendido.' });
      return z.NEVER;
    }
    return found.code;
  });

/** Código escolhido à mão no cadastro. A API confere se ele serve para o ponto. */
export const municipalityCodeSchema = z.string().regex(/^[0-9]{7}$/);
