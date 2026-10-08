import AsyncStorage from '@react-native-async-storage/async-storage';

export const cupuOnboardingKey = '@egua_adota:has_seen_onboarding';

export async function hasSeenCupuOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(cupuOnboardingKey);
  return value === 'true';
}

export async function markCupuOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(cupuOnboardingKey, 'true');
}
