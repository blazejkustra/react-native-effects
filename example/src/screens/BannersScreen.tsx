import { View, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BirthdayFireworks from '../components/BirthdayFireworks';
import PartyConfetti from '../components/PartyConfetti';
import StreakFire from '../components/StreakFire';
import CoinGeyser from '../components/CoinGeyser';
import Thunderstorm from '../components/Thunderstorm';

export default function BannersScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* A scrollable stack of notification banners. */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BirthdayFireworks />
        <PartyConfetti style={styles.banner} />
        <StreakFire style={styles.banner} />
        <CoinGeyser style={styles.banner} />
        <Thunderstorm style={styles.banner} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingHorizontal: 14,
  },
  banner: {
    marginTop: 14,
  },
});
