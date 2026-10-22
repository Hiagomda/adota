export const statusLabel: Record<string, string> = {
  open: 'Aberto',
  on_the_way: 'A caminho',
  not_found: 'Não encontrado',
  rescued: 'Resgatado',
  fostered: 'Lar temporário',
  for_adoption: 'Para adoção',
  adopted: 'Adotado',
};

/** Animal perdido tem família: some ("Procurando") e volta para casa, não é resgatado. */
const lostStatusLabel: Record<string, string> = {
  open: 'Procurando',
  on_the_way: 'Procurando',
  not_found: 'Procurando',
  rescued: 'Voltou para casa',
};

export function statusLabelFor(type: string, status: string): string {
  return (type === 'lost' ? lostStatusLabel[status] : undefined) ?? statusLabel[status] ?? status;
}

export const urgencyLabel: Record<string, string> = {
  high: 'Urgente',
  medium: 'Atenção',
  low: 'Pode esperar',
};

export const speciesLabel: Record<string, string> = {
  dog: 'Cachorro',
  cat: 'Gato',
  other: 'Outro',
};

export const typeLabel: Record<string, string> = {
  rescue_alert: 'Resgate',
  update: 'Atualização',
  adoption: 'Adoção',
  help_request: 'Pedido de ajuda',
  lost: 'Perdido',
};

export const helpKindLabel: Record<string, string> = {
  food: 'Ração',
  vet: 'Veterinário',
  castration: 'Castração',
  transport: 'Transporte',
};
