import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { fontFamily } from './tokens';

/** Font files by family name, ready for `useFonts`. Only the weights the app uses are bundled. */
export const appFonts = {
  [fontFamily.body]: Nunito_400Regular,
  [fontFamily.bodyBold]: Nunito_700Bold,
  [fontFamily.bodyHeavy]: Nunito_800ExtraBold,
  [fontFamily.titleSoft]: Baloo2_600SemiBold,
  [fontFamily.title]: Baloo2_700Bold,
  [fontFamily.display]: Baloo2_800ExtraBold,
};
