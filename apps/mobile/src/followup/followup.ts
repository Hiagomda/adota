/**
 * Acompanhamento depois da adoção (GET /posts/:id/followup). Espelho do
 * packages/shared/src/followup.ts, sem import de React Native, para rodar no node:test.
 */
import type { IconName } from '../components/ui/Icon';

export type CheckinMood = 'great' | 'ok' | 'hard';

export interface Checkin {
  day: 7 | 30 | 90;
  dueAt: string;
  due: boolean;
  answeredAt: string | null;
  mood: CheckinMood | null;
  note: string | null;
  wantsHelp: boolean;
}

export interface FollowupPage {
  role: 'tutor' | 'responsible' | 'team' | null;
  canSetAdopter: boolean;
  candidates: { id: string; name: string; handle: string }[];
  followup: {
    id: string;
    adoptedAt: string;
    closed: boolean;
    tutor: { name: string; handle: string };
    checkins: Checkin[];
  } | null;
}

export const moodOptions: { value: CheckinMood; label: string; icon: IconName }[] = [
  { value: 'great', label: 'Está ótimo', icon: 'smile' },
  { value: 'ok', label: 'Está indo bem', icon: 'meh' },
  { value: 'hard', label: 'Está difícil', icon: 'frown' },
];

export function moodLabel(mood: CheckinMood | null): string {
  return moodOptions.find((option) => option.value === mood)?.label ?? 'Sem resposta';
}

export function dayTitle(day: Checkin['day']): string {
  return day === 7 ? '1 semana' : day === 30 ? '1 mês' : '3 meses';
}

/** O check-in que o tutor deve responder agora: o mais antigo que chegou e não foi respondido. */
export function pendingCheckin(page: FollowupPage | undefined): Checkin | null {
  const followup = page?.followup;
  if (!followup || followup.closed || page?.role !== 'tutor') return null;
  return followup.checkins.find((item) => item.due && !item.answeredAt) ?? null;
}

/** Algum check-in pediu atenção de quem cuidava. */
export function needsAttention(page: FollowupPage | undefined): boolean {
  return (page?.followup?.checkins ?? []).some((item) => item.mood === 'hard' || item.wantsHelp);
}
