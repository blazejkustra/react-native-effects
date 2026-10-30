import { useCallback, useEffect, useRef } from 'react';
import { AudioContext, type AudioBuffer } from 'react-native-audio-api';

const NOISE_SECONDS = 0.25;
const TINKLES = 12;

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

function noiseBurst(
  { ctx, noise }: Synth,
  t: number,
  freq: number,
  level: number,
  decay: number
) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = between(0.8, 1.2);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + decay + 0.02);
}

function ping({ ctx }: Synth, t: number, freq: number, level: number) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

function thud({ ctx }: Synth, t: number, level: number) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(between(110, 150), t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.16);
}

/**
 * A synthesized cover glass breaking: a dull thud of the hit, a sharp
 * high-passed snap as the crack runs, then a scatter of fading glassy ticks
 * and pings for the splinters settling.
 */
export function useCrackSound() {
  const synthRef = useRef<Synth | null>(null);

  useEffect(() => {
    return () => {
      synthRef.current?.ctx.close();
      synthRef.current = null;
    };
  }, []);

  return useCallback(() => {
    if (synthRef.current === null) {
      synthRef.current = createSynth();
    }
    const synth = synthRef.current;
    const t = synth.ctx.currentTime + 0.005;
    thud(synth, t, 0.7);
    noiseBurst(synth, t, between(1800, 2600), 1.1, 0.07);
    noiseBurst(synth, t + 0.02, 4500, 0.5, 0.18);
    for (let i = 0; i < TINKLES; i++) {
      const at = t + 0.04 + Math.pow(Math.random(), 1.6) * 0.45;
      const fade = 1 - (at - t) / 0.55;
      if (Math.random() < 0.5) {
        ping(synth, at, between(3800, 7500), 0.12 * fade);
      } else {
        noiseBurst(synth, at, between(5000, 8000), 0.25 * fade, 0.015);
      }
    }
  }, []);
}
