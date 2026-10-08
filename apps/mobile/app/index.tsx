import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';
import { Mascot } from '../src/mascot';
import { useSession } from '../src/session';
import { useTheme } from '../src/theme';

export default function Gate() {
  const theme = useTheme();
  const ready = useSession((state) => state.ready);
  const onboarded = useSession((state) => state.onboarded);
  const permissionsSeen = useSession((state) => state.permissionsSeen);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          backgroundColor: theme.background,
        }}
      >
        <Mascot pose="sit" size={180} label="Mascote do Égua, adota!" />
        <Text style={{ color: theme.text, fontSize: 28, fontWeight: '700' }}>Égua, adota!</Text>
      </View>
    );
  }
  if (!onboarded) return <Redirect href="/welcome" />;
  if (!permissionsSeen) return <Redirect href="/permissions" />;
  return <Redirect href="/(tabs)" />;
}
