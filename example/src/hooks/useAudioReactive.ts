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

export type AudioReactiveOptions = {
  /**
   * Called every frame with the raw analyser readings (RMS 0..1, bass 0..1,
   * treble 0..1) BEFORE the boost + smoothing applied to `u.live`. For effects
   * that need a faster attack than a visualiser wants (a puff of breath).
   */
  onFrame?: (rms: number, bass: number, treble: number) => void;
  /** Analyser `smoothingTimeConstant`; lower = snappier. Default 0.8. */
  analyserSmoothing?: number;
};

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
 */
export function useAudioReactive(options: AudioReactiveOptions = {}): {
  paramsSynchronizable: ParamsSynchronizable;
  listening: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
} {
  const { paramsSynchronizable, setParamsSynchronizable } =
    useParamsSynchronizable([0, 0, 0, 0]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const analyserRef = useRef<ReturnType<AudioContext['createAnalyser']> | null>(
    null
  );
  const rafRef = useRef<number | null>(null);
  const smooth = useRef({ level: 0, bass: 0, treble: 0 });
  // Read through a ref so a new callback identity never restarts the mic.
  const onFrameRef = useRef(options.onFrame);
  onFrameRef.current = options.onFrame;
  const analyserSmoothing = options.analyserSmoothing ?? 0.8;

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
        setError('Microphone permission denied');
        return;
      }
      const active = await AudioManager.setAudioSessionActivity(true);
      if (!active) {
        setError('Could not activate the audio session');
        return;
      }

      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      const recorder = recorderRef.current ?? new AudioRecorder();
      recorderRef.current = recorder;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = analyserSmoothing;
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
        setError(
          'No microphone input. On the iOS Simulator pick a host mic via ' +
            'Simulator → I/O → Audio Input, or run on a physical device.'
        );
        stop();
        return;
      }

      const times = new Uint8Array(analyser.fftSize);
      const freqs = new Uint8Array(analyser.frequencyBinCount);

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

        onFrameRef.current?.(rms, bass, treble);

        // Boost + smooth so the visuals feel lively but not jittery.
        const s = smooth.current;
        s.level += (Math.min(1, rms * 3.0) - s.level) * 0.4;
        s.bass += (Math.min(1, bass * 1.3) - s.bass) * 0.4;
        s.treble += (Math.min(1, treble * 1.6) - s.treble) * 0.4;
        setParamsSynchronizable(s.level, s.bass, s.treble, 1);

        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [analyserSmoothing, setParamsSynchronizable, stop]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return { paramsSynchronizable, listening, error, start, stop, toggle };
}
