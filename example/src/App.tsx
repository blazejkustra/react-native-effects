// App.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import CircularGradientListScreen from './screens/CircularGradient/CircularGradientListScreen';
import CircularGradientAnimatedScreen from './screens/CircularGradient/CircularGradientAnimatedScreen';
import CircularGradientStaticScreen from './screens/CircularGradient/CircularGradientStaticScreen';
import CircularGradientInteractiveScreen from './screens/CircularGradient/CircularGradientInteractiveScreen';
import LinearGradientListScreen from './screens/LinearGradient/LinearGradientListScreen';
import LinearGradientAnimatedScreen from './screens/LinearGradient/LinearGradientAnimatedScreen';
import LinearGradientStaticScreen from './screens/LinearGradient/LinearGradientStaticScreen';
import IridescenceStaticScreen from './screens/Iridescence/IridescenceStaticScreen';
import LiquidChromeStaticScreen from './screens/LiquidChrome/LiquidChromeStaticScreen';
import SilkStaticScreen from './screens/Silk/SilkStaticScreen';
import CampfireStaticScreen from './screens/Campfire/CampfireStaticScreen';
import CalicoSwirlStaticScreen from './screens/CalicoSwirl/CalicoSwirlStaticScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
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
          name="CircularGradientList"
          component={CircularGradientListScreen}
        />
        <Stack.Screen
          name="CircularGradientAnimated"
          component={CircularGradientAnimatedScreen}
        />
        <Stack.Screen
          name="CircularGradientStatic"
          component={CircularGradientStaticScreen}
        />
        <Stack.Screen
          name="CircularGradientInteractive"
          component={CircularGradientInteractiveScreen}
        />
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
          component={IridescenceStaticScreen}
        />
        <Stack.Screen
          name="LiquidChromeStatic"
          component={LiquidChromeStaticScreen}
        />
        <Stack.Screen name="SilkStatic" component={SilkStaticScreen} />
        <Stack.Screen name="CampfireStatic" component={CampfireStaticScreen} />
        <Stack.Screen
          name="CalicoSwirlStatic"
          component={CalicoSwirlStaticScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
