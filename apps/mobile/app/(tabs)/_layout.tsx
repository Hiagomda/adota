import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AnimalCamera } from '../../src/AnimalCamera';
import { FloatingTabBar } from '../../src/components/ui';
import { openCreateCamera } from '../../src/createCamera';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenListeners={{
          tabPress: () => {
            void Haptics.selectionAsync().catch(() => undefined);
          },
        }}
        screenOptions={{
          headerShown: false,
          lazy: true,
          // Keeps MapLibre mounted when leaving Explorar. Unmounting <UserLocation> on blur
          // crashes RN 0.86 (AnimatedPoint overwrites AnimatedNode._listeners).
          freezeOnBlur: true,
        }}
      >
        <Tabs.Screen name="index" options={{ tabBarAccessibilityLabel: 'Início' }} />
        <Tabs.Screen name="explore" options={{ tabBarAccessibilityLabel: 'Mapa' }} />
        <Tabs.Screen
          name="create"
          listeners={{
            tabPress: (event) => {
              const pending = openCreateCamera();
              if (!pending) return;
              // Stay on the current tab until there is a photo. The form was flashing for a
              // second while the camera permission resolved.
              event.preventDefault();
              void pending.then((shot) => {
                if ('canceled' in shot) return;
                router.navigate('/create');
              });
            },
          }}
          options={{ tabBarAccessibilityLabel: 'Criar resgate' }}
        />
        <Tabs.Screen name="alerts" options={{ tabBarAccessibilityLabel: 'Notificações' }} />
        <Tabs.Screen name="profile" options={{ tabBarAccessibilityLabel: 'Perfil' }} />
      </Tabs>
      <AnimalCamera />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
