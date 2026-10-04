import { StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.screen, isDark ? styles.screenDark : styles.screenLight]}>
      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, isDark ? styles.titleDark : styles.titleLight]}
        >
          Patinha
        </Text>
        <Text style={[styles.subtitle, isDark ? styles.subtitleDark : styles.subtitleLight]}>
          Rede de resgate de animais de rua
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenLight: {
    backgroundColor: '#FFFFFF',
  },
  screenDark: {
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
  },
  titleLight: {
    color: '#111111',
  },
  titleDark: {
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
  },
  subtitleLight: {
    color: '#444444',
  },
  subtitleDark: {
    color: '#D0D0D0',
  },
});
