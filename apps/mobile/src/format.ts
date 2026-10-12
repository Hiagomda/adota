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

export function distanceKmBetween(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRad(to.latitude - from.latitude);
  const longitudeDelta = toRad(to.longitude - from.longitude);
  const fromLat = toRad(from.latitude);
  const toLat = toRad(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Distance from the person to the animal, or an empty string when the phone has no fix yet. */
export function distanceLabel(
  from: { latitude: number; longitude: number } | null,
  to: { latitude: number; longitude: number },
): string {
  if (!from) return '';
  return formatKm(distanceKmBetween(from, to));
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
