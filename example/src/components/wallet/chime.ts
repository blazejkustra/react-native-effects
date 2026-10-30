import { AudioContext } from 'react-native-audio-api';

let ctx: AudioContext | null = null;

function tone(ac: AudioContext, freq: number, at: number, length: number) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(0.18, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, at + length);
  osc.connect(env);
  env.connect(ac.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A soft two-note success chime, in the spirit of the Apple Pay ding. */
export function playChime() {
  try {
    ctx = ctx ?? new AudioContext();
    const t0 = ctx.currentTime + 0.01;
    tone(ctx, 1318.5, t0, 0.5);
    tone(ctx, 1975.5, t0 + 0.09, 0.7);
  } catch {
    // Silent fallback: the haptic and check mark still land.
  }
}
