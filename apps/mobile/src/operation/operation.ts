/**
 * Modo de operação do resgate: tipos de GET /posts/:id/operation e a ordem dos passos. Sem
 * import de React Native, para rodar no node:test.
 */

export type OperationOutcome = 'found' | 'not_found' | 'could_not';

export interface OperationPage {
  status: string;
  isAuthor: boolean;
  willHelp: boolean;
  canOperate: boolean;
  operation: {
    departedAt: string | null;
    arrivedAt: string | null;
    finishedAt: string | null;
    outcome: OperationOutcome | null;
    summary: string | null;
  } | null;
  team: { name: string; departedAt: string | null; arrivedAt: string | null }[];
}

export type OperationStep = 'depart' | 'arrive' | 'found' | 'summary' | 'done';

export const operationSteps: { value: Exclude<OperationStep, 'done'>; title: string }[] = [
  { value: 'depart', title: 'Saí para ajudar' },
  { value: 'arrive', title: 'Cheguei ao local' },
  { value: 'found', title: 'Encontrei o animal?' },
  { value: 'summary', title: 'Resumo do atendimento' },
];

const street = new Set(['open', 'on_the_way', 'not_found']);

/**
 * Onde a pessoa parou. `pending` é a escolha feita agora e ainda não enviada ("não encontrei"
 * leva direto ao resumo). Quando o animal já saiu da rua, falta só o resumo.
 */
export function currentStep(
  page: Pick<OperationPage, 'status' | 'operation'> | undefined,
  pending: OperationOutcome | null = null,
): OperationStep {
  const operation = page?.operation ?? null;
  if (operation?.finishedAt) return 'done';
  if (pending) return 'summary';
  if (page && !street.has(page.status)) return 'summary';
  if (!operation?.departedAt) return 'depart';
  if (!operation.arrivedAt) return 'arrive';
  return 'found';
}

/** O resultado que vai junto do resumo. */
export function finishOutcome(
  page: Pick<OperationPage, 'status'> | undefined,
  pending: OperationOutcome | null,
): OperationOutcome {
  if (pending) return pending;
  return page && !street.has(page.status) ? 'found' : 'not_found';
}

export function stepIndex(step: OperationStep): number {
  if (step === 'done') return operationSteps.length;
  return operationSteps.findIndex((item) => item.value === step);
}

/** "Ana chegou", "Ana está indo", "Ana disse que vai": o que os outros fizeram. */
export function teamLine(team: OperationPage['team']): string | null {
  if (team.length === 0) return null;
  const parts = team
    .slice(0, 3)
    .map((person) =>
      person.arrivedAt
        ? `${person.name} já chegou`
        : person.departedAt
          ? `${person.name} está indo`
          : `${person.name} disse que vai`,
    );
  const rest = team.length - parts.length;
  return rest > 0 ? `${parts.join(', ')} e mais ${rest}` : parts.join(', ');
}

/** Link para abrir o ponto exato no app de mapas do celular. */
export function mapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
