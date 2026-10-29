import { AudioContext } from 'react-native-audio-api';

let ctx: AudioContext | null = null;

function context() {
  ctx = ctx ?? new AudioContext();
  return ctx;
}

function envelope(ac: AudioContext, at: number, peak: number, length: number) {
  const env = ac.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(peak, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0005, at + length);
  env.connect(ac.destination);
  return env;
}

function thump(ac: AudioContext, at: number, from: number, to: number) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.3);
  osc.connect(envelope(ac, at, 0.5, 0.35));
  osc.start(at);
  osc.stop(at + 0.4);
}

function crackle(ac: AudioContext, at: number, length: number, peak: number) {
  const buffer = ac.createBuffer(
    1,
    Math.ceil(ac.sampleRate * length),
    ac.sampleRate
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() < 0.04 ? Math.random() * 2 - 1 : 0;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  src.connect(hp);
  hp.connect(envelope(ac, at, peak, length));
  src.start(at);
}

function whine(ac: AudioContext, at: number, length: number) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(15734, at);
  osc.frequency.linearRampToValueAtTime(15400, at + length);
  osc.connect(envelope(ac, at, 0.025, length));
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function hum(ac: AudioContext, at: number, length: number) {
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 60;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  osc.connect(lp);
  lp.connect(envelope(ac, at, 0.22, length));
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** The tube switching off: a relay thunk, static and the flyback whine dying. */
export function playPowerOff() {
  try {
    const ac = context();
    const t0 = ac.currentTime + 0.01;
    thump(ac, t0, 90, 38);
    crackle(ac, t0, 0.18, 0.35);
    whine(ac, t0, 0.7);
  } catch {
    // Sound is optional; the picture still collapses.
  }
}

/** The tube warming up: a degauss thump and a fading 60 Hz buzz. */
export function playPowerOn() {
  try {
    const ac = context();
    const t0 = ac.currentTime + 0.01;
    thump(ac, t0 + 0.18, 55, 32);
    hum(ac, t0 + 0.18, 0.9);
    crackle(ac, t0, 0.3, 0.25);
  } catch {
    // Sound is optional; the picture still powers on.
  }
}
