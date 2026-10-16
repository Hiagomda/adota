import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSeenFloor } from './levelUp';

const seenLevelKey = '@egua_adota:seen_level_floor';

/** Floor of the last level the person saw on "Sua rede", or null on the first visit. */
export async function readSeenFloor(): Promise<number | null> {
  return parseSeenFloor(await AsyncStorage.getItem(seenLevelKey));
}

export async function writeSeenFloor(floor: number): Promise<void> {
  await AsyncStorage.setItem(seenLevelKey, String(floor));
}
