import { createWorkletRuntime, scheduleOnRuntime } from 'react-native-worklets';

export const BackgroundRuntime = createWorkletRuntime({
  name: 'react-native-effects',
});

export function runOnBackground(callback: (...args: any[]) => void) {
  'worklet';
  return scheduleOnRuntime(BackgroundRuntime, callback);
}
