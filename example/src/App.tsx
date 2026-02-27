// App.tsx
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import HomeScreen from './screens/HomeScreen';
import LinearGradientListScreen from './screens/LinearGradient/LinearGradientListScreen';
import LinearGradientAnimatedScreen from './screens/LinearGradient/LinearGradientAnimatedScreen';
import LinearGradientStaticScreen from './screens/LinearGradient/LinearGradientStaticScreen';
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
