import {
  AudioContext,
  type AudioBufferSourceNode,
  type BiquadFilterNode,
  type GainNode,
} from 'react-native-audio-api';

type Voice = {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  tone: BiquadFilterNode;
  level: GainNode;
};

let voice: Voice | null = null;

function createVoice(): Voice {
  const ctx = new AudioContext();
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let grit = 0;
  for (let i = 0; i < length; i++) {
    grit = Math.random() < 0.02 ? Math.random() : grit * 0.96;
    data[i] = (Math.random() * 2 - 1) * (0.35 + 0.65 * grit);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const tone = ctx.createBiquadFilter();
  tone.type = 'bandpass';
  tone.frequency.value = 2600;
  tone.Q.value = 0.7;
  const level = ctx.createGain();
  level.gain.value = 0;
  source.connect(tone);
  tone.connect(level);
  level.connect(ctx.destination);
  source.start();
  return { ctx, source, tone, level };
}

/**
 * The rasp of a coin on latex: looped crackly noise through a bandpass whose
 * loudness and brightness follow how fast the finger moves (pt/s).
 */
export function setScratchSpeed(speed: number) {
  try {
    voice = voice ?? createVoice();
    const amount = Math.min(1, speed / 900);
    const now = voice.ctx.currentTime;
    voice.level.gain.setTargetAtTime(amount * 0.5, now, 0.03);
    voice.tone.frequency.setTargetAtTime(1800 + amount * 2600, now, 0.05);
  } catch {
    // No audio: scratching still works, just silently.
  }
}
