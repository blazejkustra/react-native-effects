import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioContext,
  AudioManager,
  AudioRecorder,
} from 'react-native-audio-api';
import {
  useParamsSynchronizable,
  type ParamsSynchronizable,
} from 'react-native-effects';

const FFT_SIZE = 512;

/**
 * Captures the microphone via react-native-audio-api and feeds a shader's
 * `u.live` with live audio so the visual reacts to your voice:
 *
 *   - `live.x` → overall level (RMS, 0..1, boosted + smoothed)
 *   - `live.y` → bass energy (0..1)
 *   - `live.z` → treble energy (0..1)
 *   - `live.w` → 1 while listening, 0 otherwise
 *
 * The mic runs through `recorder → adapter → analyser → (muted gain) →
 * destination`; the muted gain keeps the graph pulling without playing your
 * voice back. Each frame we read the analyser on the JS thread and write the
 * synchronizable the off-thread render loop consumes.
 *
 * When no real mic input is available (the usual case on the iOS Simulator),
 * it falls back to synthesizing a speech-like envelope — syllable bursts with
 * phrase pauses — so the visuals still behave as if someone were talking.
 */
export function useAudioReactive(): {
  paramsSynchronizable: ParamsSynchronizable;
  listening: boolean;
  /** True when no real mic was available and a fake voice drives the params. */
  simulated: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0]);
  const [listening, setListening] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const analyserRef = useRef<ReturnType<AudioContext['createAnalyser']> | null>(
    null
  );
  const rafRef = useRef<number | null>(null);
  const smooth = useRef({ level: 0, bass: 0, treble: 0 });

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      recorderRef.current?.stop();
    } catch {}
    try {
      ctxRef.current?.suspend();
    } catch {}
    AudioManager.setAudioSessionActivity(false);
    smooth.current = { level: 0, bass: 0, treble: 0 };
    setParamsSynchronizable(0, 0, 0, 0);
    setListening(false);
    setSimulated(false);
  }, [setParamsSynchronizable]);

  /**
   * Fake voice for environments without a mic: syllables pulse at ~4–7 Hz
   * inside phrases of a couple of seconds, separated by silences, with the
   * amplitude wandering so no two phrases look alike.
   */
  const startSimulation = useCallback(() => {
    const t0 = performance.now();
    const loop = () => {
      const tt = (performance.now() - t0) / 1000;

      // Phrase gate: mostly on, with natural pauses between "sentences".
      const phraseWave =
        Math.sin(tt * 0.9) + Math.sin(tt * 0.53 + 1.7) + Math.sin(tt * 0.31);
      const phrase = phraseWave > -0.9 ? 1 : 0;

      // Syllables: a few interfering pulse trains, rectified.
      const syll =
        Math.max(0, Math.sin(tt * 6.8) * 0.6 + Math.sin(tt * 4.1 + 0.9) * 0.4) *
        (0.55 + 0.45 * Math.sin(tt * 1.3 + Math.sin(tt * 2.7) * 1.5));
      const target = phrase * Math.min(1, 0.18 + 0.85 * syll);

      const s = smooth.current;
      s.level += (target - s.level) * 0.35;
      s.bass +=
        (phrase * (0.25 + 0.45 * Math.abs(Math.sin(tt * 2.3 + 0.4))) - s.bass) *
        0.25;
      s.treble +=
        (phrase * (0.15 + 0.55 * Math.abs(Math.sin(tt * 9.7 + 2.1))) -
          s.treble) *
        0.35;
      setParamsSynchronizable(s.level, s.bass, s.treble, 1);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    setSimulated(true);
    setListening(true);
  }, [setParamsSynchronizable]);

  const start = useCallback(async () => {
    try {
      setError(null);
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'default',
        iosOptions: ['defaultToSpeaker'],
      });

      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') {
        startSimulation();
        return;
      }
      const active = await AudioManager.setAudioSessionActivity(true);
      if (!active) {
        startSimulation();
        return;
      }

      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const recorder = recorderRef.current ?? new AudioRecorder();
      recorderRef.current = recorder;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      // mic → adapter → analyser → muted gain → destination (no playback echo)
      const adapter = ctx.createRecorderAdapter();
      const mute = ctx.createGain();
      mute.gain.value = 0;
      adapter.connect(analyser);
      analyser.connect(mute);
      mute.connect(ctx.destination);
      recorder.connect(adapter);

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // NOTE: AudioRecorder.start() hardcodes a `{ status: 'success' }` result
      // when file output is disabled (our case), swallowing the native error —
      // so its return value can't be trusted. Verify the real state instead.
      recorder.start();
      if (!recorder.isRecording()) {
        // No real mic (typical on the iOS Simulator) — synthesize a voice.
        try {
          recorder.stop();
        } catch {}
        startSimulation();
        return;
      }

      const times = new Uint8Array(analyser.fftSize);
      const freqs = new Uint8Array(analyser.frequencyBinCount);

      // Watchdog: a simulator "mic" happily records dead silence. If the
      // first ~1.5s is perfectly flat, hand over to the simulated voice.
      let frames = 0;
      let maxRms = 0;

      const loop = () => {
        const a = analyserRef.current;
        if (!a) {
          return;
        }
        a.getByteTimeDomainData(times);
        a.getByteFrequencyData(freqs);

        // RMS level from the time-domain waveform.
        let sum = 0;
        for (let i = 0; i < times.length; i++) {
          const v = (times[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / times.length);

        frames++;
        maxRms = Math.max(maxRms, rms);
        if (frames >= 90 && maxRms < 0.001) {
          try {
            recorder.stop();
          } catch {}
          startSimulation();
          return;
        }

        // Bass = low bins, treble = high bins.
        const n = freqs.length;
        const bassEnd = Math.max(1, Math.floor(n * 0.12));
        const trebStart = Math.floor(n * 0.5);
        let bass = 0;
        for (let i = 0; i < bassEnd; i++) {
          bass += freqs[i]!;
        }
        bass = bass / bassEnd / 255;
        let treble = 0;
        let tc = 0;
        for (let i = trebStart; i < n; i++) {
          treble += freqs[i]!;
          tc++;
        }
        treble = tc ? treble / tc / 255 : 0;

        // Boost + smooth so the visuals feel lively but not jittery.
        const s = smooth.current;
        s.level += (Math.min(1, rms * 3.0) - s.level) * 1.2;
        s.bass += (Math.min(1, bass * 1.3) - s.bass) * 1.2;
        s.treble += (Math.min(1, treble * 1.6) - s.treble) * 1.2;
        setParamsSynchronizable(s.level, s.bass, s.treble, 1);

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      startSimulation();
    }
  }, [setParamsSynchronizable, startSimulation]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return {
    paramsSynchronizable,
    listening,
    simulated,
    error,
    start,
    stop,
    toggle,
  };
}
