import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
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
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }
  if (!onboarded) return <Redirect href="/welcome" />;
  if (!permissionsSeen) return <Redirect href="/permissions" />;
  return <Redirect href="/(tabs)" />;
}
