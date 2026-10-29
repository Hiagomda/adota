import { Redirect } from 'expo-router';

/** As feiras agora são uma categoria da agenda. O endereço antigo continua abrindo a lista delas. */
export default function FairsScreen() {
  return <Redirect href={{ pathname: '/agenda', params: { categoria: 'adoption_fair' } }} />;
}
