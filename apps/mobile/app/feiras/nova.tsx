import { Redirect } from 'expo-router';

/** Divulgar feira agora é marcar um evento da agenda do tipo feira de adoção. */
export default function NewFairScreen() {
  return <Redirect href={{ pathname: '/agenda/novo', params: { categoria: 'adoption_fair' } }} />;
}
