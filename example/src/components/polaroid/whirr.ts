import { AudioContext } from 'react-native-audio-api';

let ctx: AudioContext | null = null;

function context(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
  }
  return ctx;
}

/**
 * The eject motor: a low buzzing sawtooth through a lowpass, with a
 * gear-train wobble on its pitch.
 */
export function playWhirr(seconds: number) {
  try {
    const ac = context();
    const t0 = ac.currentTime + 0.02;

    const motor = ac.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(70, t0);
    motor.frequency.linearRampToValueAtTime(118, t0 + 0.12);
    motor.frequency.linearRampToValueAtTime(108, t0 + seconds);

    const wobble = ac.createOscillator();
    wobble.frequency.value = 23;
    const wobbleDepth = ac.createGain();
    wobbleDepth.gain.value = 6;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(motor.frequency);

    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1100;
    tone.Q.value = 2;

    const env = ac.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.16, t0 + 0.06);
    env.gain.setValueAtTime(0.16, t0 + seconds - 0.08);
    env.gain.linearRampToValueAtTime(0, t0 + seconds);

    motor.connect(tone);
    tone.connect(env);
    env.connect(ac.destination);
    motor.start(t0);
    wobble.start(t0);
    motor.stop(t0 + seconds + 0.05);
    wobble.stop(t0 + seconds + 0.05);
  } catch {
    // Audio is a nicety; the print still ejects without it.
  }
}
