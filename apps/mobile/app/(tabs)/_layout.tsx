import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.highlight,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.tabBar },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarAccessibilityLabel: 'Início',
          tabBarIcon: ({ color }) => <Feather name="home" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          tabBarAccessibilityLabel: 'Mapa',
          tabBarIcon: ({ color }) => <Feather name="map" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarAccessibilityLabel: 'Criar resgate',
          tabBarIcon: ({ color }) => <Feather name="plus-circle" color={color} size={28} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          tabBarAccessibilityLabel: 'Notificações',
          tabBarIcon: ({ color }) => <Feather name="bell" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarAccessibilityLabel: 'Perfil',
          tabBarIcon: ({ color }) => <Feather name="user" color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
