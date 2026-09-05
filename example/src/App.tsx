// App.tsx
import {
  NavigationContainer,
  DefaultTheme,
  type Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import HomeScreen from './screens/HomeScreen';
import LinearGradientListScreen from './screens/LinearGradient/LinearGradientListScreen';
import LinearGradientAnimatedScreen from './screens/LinearGradient/LinearGradientAnimatedScreen';
import LinearGradientStaticScreen from './screens/LinearGradient/LinearGradientStaticScreen';
import IridescenceScreen from './screens/IridescenceScreen';
import LiquidChromeScreen from './screens/LiquidChromeScreen';
import SilkScreen from './screens/SilkScreen';
import CampfireScreen from './screens/CampfireScreen';
import CalicoSwirlScreen from './screens/CalicoSwirlScreen';
import AuroraScreen from './screens/AuroraScreen';
import CircularGradientScreen from './screens/CircularGradientScreen';
import SiriOrbScreen from './screens/SiriOrbScreen';
import HoloCardScreen from './screens/HoloCardScreen';
import WeatherScreen from './screens/WeatherScreen';
import ScrollReactiveScreen from './screens/ScrollReactiveScreen';
import TouchFieldScreen from './screens/TouchFieldScreen';
import ThanosScreen from './screens/ThanosScreen';
import AiShimmerScreen from './screens/AiShimmerScreen';
import AiOrbScreen from './screens/AiOrbScreen';
import AiVoiceScreen from './screens/AiVoiceScreen';
import HoloFoilScreen from './screens/HoloFoilScreen';
import BannersScreen from './screens/BannersScreen';
import InkBloomScreen from './screens/InkBloomScreen';
import MaterialsScreen from './screens/MaterialsScreen';
import BeerScreen from './screens/BeerScreen';
import LighterScreen from './screens/LighterScreen';
import TelegramDissolveScreen from './screens/TelegramDissolveScreen';
import BirthdayCandleScreen from './screens/BirthdayCandleScreen';
import ParticleDispersionScreen from './screens/ParticleDispersionScreen';
import FoamLabScreen from './screens/FoamLabScreen';
import CigaretteScreen from './screens/CigaretteScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Dark theme so the surface revealed behind/around the cards during a stack
// transition is black, not React Navigation's default light grey (which flashed
// white at the screen edges while sliding).
const navTheme: Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#000',
    card: '#000',
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
            contentStyle: { backgroundColor: '#000' },
            presentation: 'card',
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="LinearGradientList"
            component={LinearGradientListScreen}
          />
          <Stack.Screen
            name="LinearGradientAnimated"
            component={LinearGradientAnimatedScreen}
          />
          <Stack.Screen
            name="LinearGradientStatic"
            component={LinearGradientStaticScreen}
          />
          <Stack.Screen
            name="IridescenceStatic"
            component={IridescenceScreen}
          />
          <Stack.Screen
            name="LiquidChromeStatic"
            component={LiquidChromeScreen}
          />
          <Stack.Screen name="SilkStatic" component={SilkScreen} />
          <Stack.Screen name="CampfireStatic" component={CampfireScreen} />
          <Stack.Screen
            name="CalicoSwirlStatic"
            component={CalicoSwirlScreen}
          />
          <Stack.Screen name="AuroraStatic" component={AuroraScreen} />
          <Stack.Screen
            name="CircularGradientList"
            component={CircularGradientScreen}
          />
          <Stack.Screen name="SiriOrbStatic" component={SiriOrbScreen} />
          <Stack.Screen name="HoloCardExample" component={HoloCardScreen} />
          <Stack.Screen name="WeatherExample" component={WeatherScreen} />
          <Stack.Screen
            name="ScrollReactiveExample"
            component={ScrollReactiveScreen}
          />
          <Stack.Screen name="TouchFieldExample" component={TouchFieldScreen} />
          <Stack.Screen name="ThanosExample" component={ThanosScreen} />
          <Stack.Screen name="AiShimmerExample" component={AiShimmerScreen} />
          <Stack.Screen name="AiOrbExample" component={AiOrbScreen} />
          <Stack.Screen name="AiVoiceExample" component={AiVoiceScreen} />
          <Stack.Screen name="HoloFoilExample" component={HoloFoilScreen} />
          <Stack.Screen name="BannersExample" component={BannersScreen} />
          <Stack.Screen name="InkBloomExample" component={InkBloomScreen} />
          <Stack.Screen name="MaterialsExample" component={MaterialsScreen} />
          <Stack.Screen name="BeerExample" component={BeerScreen} />
          <Stack.Screen name="LighterExample" component={LighterScreen} />
          <Stack.Screen
            name="TelegramDissolveExample"
            component={TelegramDissolveScreen}
          />
          <Stack.Screen
            name="BirthdayCandleExample"
            component={BirthdayCandleScreen}
          />
          <Stack.Screen
            name="ParticleDispersionExample"
            component={ParticleDispersionScreen}
          />
          <Stack.Screen name="FoamLabExample" component={FoamLabScreen} />
          <Stack.Screen name="CigaretteExample" component={CigaretteScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
});
