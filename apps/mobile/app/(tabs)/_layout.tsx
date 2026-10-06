import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.highlight,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: { backgroundColor: theme.tabBar, borderTopColor: theme.tabBar },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ color }) => <Feather name="home" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="explore"
        options={{ tabBarIcon: ({ color }) => <Feather name="map" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: ({ color }) => <Feather name="plus-circle" color={color} size={28} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{ tabBarIcon: ({ color }) => <Feather name="bell" color={color} size={24} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarIcon: ({ color }) => <Feather name="user" color={color} size={24} /> }}
      />
    </Tabs>
  );
}
