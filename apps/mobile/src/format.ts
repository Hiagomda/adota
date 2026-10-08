export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const elapsed = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime()) || elapsed < 60_000) return 'agora';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return minutes === 1 ? 'há 1 minuto' : `há ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'há 1 hora' : `há ${hours} horas`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'há 1 dia' : `há ${days} dias`;
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function formatKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) {
    const meters = Math.max(100, Math.round((km * 1000) / 100) * 100);
    return `a cerca de ${meters} m`;
  }
  const rounded = km < 10 ? Math.round(km * 10) / 10 : Math.round(km);
  const text = rounded.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return rounded === 1 ? 'a 1 km' : `a ${text} km`;
}
