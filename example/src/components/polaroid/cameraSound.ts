import {
  AudioContext,
  type AudioBuffer,
  type AudioBufferSourceNode,
  type GainNode,
} from 'react-native-audio-api';
import { filmWhirr, shutterClick } from './cameraSamples';

type Sounds = { ac: AudioContext; click: AudioBuffer; whirr: AudioBuffer };
type Voice = { source: AudioBufferSourceNode; level: GainNode };

const RELEASE_SECONDS = 0.04;

let sounds: Sounds | null = null;
let voice: Voice | null = null;

function toBuffer(ac: AudioContext, samples: Float32Array<ArrayBuffer>) {
  const buffer = ac.createBuffer(1, samples.length, ac.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

function loadSounds(): Sounds {
  if (!sounds) {
    const ac = new AudioContext();
    sounds = {
      ac,
      click: toBuffer(ac, shutterClick(ac.sampleRate)),
      whirr: toBuffer(ac, filmWhirr(ac.sampleRate)),
    };
  }
  return sounds;
}

export function stopCameraSound() {
  if (!voice || !sounds) {
    return;
  }
  const now = sounds.ac.currentTime;
  voice.level.gain.setTargetAtTime(0, now, RELEASE_SECONDS / 4);
  voice.source.stop(now + RELEASE_SECONDS);
  voice = null;
}

function play(pick: (loaded: Sounds) => AudioBuffer) {
  try {
    stopCameraSound();
    const loaded = loadSounds();
    const source = loaded.ac.createBufferSource();
    source.buffer = pick(loaded);
    const level = loaded.ac.createGain();
    source.connect(level);
    level.connect(loaded.ac.destination);
    source.start();
    voice = { source, level };
  } catch {
    voice = null;
  }
}

export function playShutterClick() {
  play(({ click }) => click);
}

export function playFilmWhirr() {
  play(({ whirr }) => whirr);
}
