import { useCallback, useEffect, useRef } from 'react';
import { AudioContext, type AudioBuffer } from 'react-native-audio-api';

const NOISE_SECONDS = 0.12;

type Synth = { ctx: AudioContext; noise: AudioBuffer };

function createSynth(): Synth {
  const ctx = new AudioContext();
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noise.copyToChannel(data, 0);
  return { ctx, noise };
}

function between(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/**
 * A synthesized bubble-wrap pop: a few milliseconds of band-passed noise for
 * the snap of the film tearing, over a short falling sine for the thump of
 * the air letting go. Pitch, brightness and level are drawn fresh for every
 * pop so a run of them never sounds like one sample on repeat.
 */
export function usePopSound() {
  const synthRef = useRef<Synth | null>(null);

  useEffect(() => {
    return () => {
      synthRef.current?.ctx.close();
      synthRef.current = null;
    };
  }, []);

  return useCallback((size = 1) => {
    if (synthRef.current === null) {
      synthRef.current = createSynth();
    }
    const { ctx, noise } = synthRef.current;
    const t = ctx.currentTime + 0.005;
    const level = between(0.75, 1) * size;

    const snap = ctx.createBufferSource();
    snap.buffer = noise;
    snap.playbackRate.value = between(0.8, 1.3);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = between(1600, 3400);
    band.Q.value = 0.9;
    const snapGain = ctx.createGain();
    snapGain.gain.setValueAtTime(level * 1.4, t);
    snapGain.gain.exponentialRampToValueAtTime(0.001, t + between(0.035, 0.06));
    snap.connect(band);
    band.connect(snapGain);
    snapGain.connect(ctx.destination);
    snap.start(t);
    snap.stop(t + 0.1);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const f0 = between(120, 190);
    thump.frequency.setValueAtTime(f0, t);
    thump.frequency.exponentialRampToValueAtTime(f0 * 0.4, t + 0.08);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(level * 0.55, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(t);
    thump.stop(t + 0.12);
  }, []);
}
