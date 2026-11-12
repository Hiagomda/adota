import AsyncStorage from '@react-native-async-storage/async-storage';

// The flag is per account, so a new account on a phone where someone already saw the
// presentation still gets it.
const keyPrefix = '@egua_adota:has_seen_onboarding';

/** Old flag saved once per phone. It hid the presentation from every account created after it. */
const legacyDeviceKey = keyPrefix;

export function cupuOnboardingKey(userId: string): string {
  return `${keyPrefix}:${userId}`;
}

export async function hasSeenCupuOnboarding(userId: string): Promise<boolean> {
  const value = await AsyncStorage.getItem(cupuOnboardingKey(userId));
  return value === 'true';
}

export async function markCupuOnboardingSeen(userId: string): Promise<void> {
  await AsyncStorage.setItem(cupuOnboardingKey(userId), 'true');
  await AsyncStorage.removeItem(legacyDeviceKey);
}

// Aviso de que o app está em pleno desenvolvimento, com o besourinho de avisar bug. Fica num
// marcador próprio para quem já viu a apresentação antes dele existir também ver uma vez.
const devNoticePrefix = '@egua_adota:has_seen_dev_notice';

export function devNoticeKey(userId: string): string {
  return `${devNoticePrefix}:${userId}`;
}

export async function hasSeenDevNotice(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(devNoticeKey(userId))) === 'true';
}

export async function markDevNoticeSeen(userId: string): Promise<void> {
  await AsyncStorage.setItem(devNoticeKey(userId), 'true');
}
