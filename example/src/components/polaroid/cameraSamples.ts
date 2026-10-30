const CLICK_SECONDS = 0.06;
const WHIRR_SECONDS = 0.6;
const CLICK_PEAK = 0.16;
const WHIRR_PEAK = 0.05;
const GEAR_TEETH_PER_SECOND = 120;

function noise(length: number) {
  return Float32Array.from({ length }, () => Math.random() * 2 - 1);
}

function lowpass(input: Float32Array, cutoff: number, sampleRate: number) {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  const output = new Float32Array(input.length);
  let state = 0;
  input.forEach((sample, i) => {
    state += k * (sample - state);
    output[i] = state;
  });
  return output;
}

function highpass(input: Float32Array, cutoff: number, sampleRate: number) {
  const low = lowpass(input, cutoff, sampleRate);
  return input.map((sample, i) => sample - low[i]!);
}

function bandNoise(length: number, lo: number, hi: number, rate: number) {
  return highpass(lowpass(noise(length), hi, rate), lo, rate);
}

function normalize(samples: Float32Array, peak: number) {
  const max = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 1e-6);
  return samples.map((s) => (s / max) * peak);
}

/** Two soft ticks of the blades opening and closing. */
export function shutterClick(sampleRate: number) {
  const length = Math.floor(sampleRate * CLICK_SECONDS);
  const open = bandNoise(length, 2500, 9000, sampleRate);
  const close = bandNoise(length, 900, 3500, sampleRate);
  const closeAt = 0.022;
  const mixed = open.map((sample, i) => {
    const t = i / sampleRate;
    const opening = sample * Math.exp(-t / 0.0025);
    const closing =
      t < closeAt ? 0 : close[i]! * 0.7 * Math.exp(-(t - closeAt) / 0.006);
    const tail = 1 - t / CLICK_SECONDS;
    return (opening + closing) * tail;
  });
  return normalize(mixed, CLICK_PEAK);
}

/** Airy gear rattle: uneven noise bursts with no pitch to drone or slide. */
export function filmWhirr(sampleRate: number) {
  const length = Math.floor(sampleRate * WHIRR_SECONDS);
  const air = bandNoise(length, 1400, 5200, sampleRate);
  const teeth = Float32Array.from(
    { length: Math.ceil(WHIRR_SECONDS * GEAR_TEETH_PER_SECOND) + 1 },
    () => 0.55 + Math.random() * 0.45
  );
  const shaped = air.map((sample, i) => {
    const t = i / sampleRate;
    const tooth = teeth[Math.floor(t * GEAR_TEETH_PER_SECOND)]!;
    const attack = Math.min(1, t / 0.02);
    const fade = Math.max(0, Math.min(1, (WHIRR_SECONDS - t) / 0.5));
    return sample * tooth * attack * Math.sin((fade * Math.PI) / 2) ** 2;
  });
  return normalize(shaped, WHIRR_PEAK);
}
