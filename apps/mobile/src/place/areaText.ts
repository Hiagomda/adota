import { coverageText } from '../map/serviceArea';

/** Ponto fora das cidades atendidas, ao publicar. */
export const outsideAreaMessage = `Esse ponto fica fora das cidades atendidas (${coverageText}). Escolha um lugar dentro da área verde.`;

/** A pessoa arrastou o mapa para fora da área. */
export const outsideAreaDrag = `O mapa só libera as cidades atendidas: ${coverageText}.`;

/** O GPS achou a pessoa fora da área. */
export const outsideAreaGps =
  'Sua localização está fora das cidades atendidas. Mova o mapa até a área verde.';
