import {
  ShaderView,
  type ParamsSynchronizable,
  type ShaderViewProps,
} from 'react-native-effects';

type PayGlyphProps = Omit<
  ShaderViewProps,
  'fragmentShader' | 'paramsSynchronizable' | 'transparent'
> & {
  /**
   * `u.live = (face, ring, check, reader)` and
   * `u.liveData[0] = (done, spin phase, nod, 0)`, every amount 0..1.
   */
  paramsSynchronizable: ParamsSynchronizable;
};

/**
 * The status glyph of the Apple Pay sheet, drawn as distance fields so each
 * stage can morph into the next: the Face ID face (its corner brackets close
 * into a spinning ring while it scans, then a check mark draws), the
 * iPhone-in-a-ring reader glyph with a soft pulse for Hold Near Reader, and
 * the blue disc with its check for Done.
 */
export default function PayGlyph({
  paramsSynchronizable,
  ...rest
}: PayGlyphProps) {
  return (
    <ShaderView
      fragmentShader={SHADER}
      paramsSynchronizable={paramsSynchronizable}
      transparent
      {...rest}
    />
  );
}

const SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
  live:       vec4<f32>,
  liveData:   array<vec4<f32>, 96>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

const STROKE = 0.05;
const BLUE = vec3<f32>(0.04, 0.52, 1.0);

fn segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

fn arc(p: vec2<f32>, c: vec2<f32>, r: f32, a0: f32, a1: f32) -> f32 {
  let d = p - c;
  let ang = atan2(d.y, d.x);
  if (ang >= a0 && ang <= a1) {
    return abs(length(d) - r);
  }
  let e0 = c + r * vec2<f32>(cos(a0), sin(a0));
  let e1 = c + r * vec2<f32>(cos(a1), sin(a1));
  return min(length(p - e0), length(p - e1));
}

fn brackets(c: vec2<f32>) -> f32 {
  let q = abs(c);
  let corner = arc(q, vec2<f32>(0.56), 0.24, 0.0, 1.5708);
  let side = min(
    segment(q, vec2<f32>(0.8, 0.56), vec2<f32>(0.8, 0.34)),
    segment(q, vec2<f32>(0.56, 0.8), vec2<f32>(0.34, 0.8))
  );
  return min(corner, side);
}

fn face(c: vec2<f32>, nod: f32) -> f32 {
  let o = vec2<f32>(nod * 0.06, nod * 0.03);
  let eyes = min(
    segment(c, vec2<f32>(-0.27, 0.24) + o, vec2<f32>(-0.27, 0.1) + o),
    segment(c, vec2<f32>(0.27, 0.24) + o, vec2<f32>(0.27, 0.1) + o)
  );
  let nose = min(
    segment(c, vec2<f32>(0.02, 0.24) + o, vec2<f32>(0.02, -0.08) + o),
    segment(c, vec2<f32>(0.02, -0.08) + o, vec2<f32>(-0.07, -0.08) + o)
  );
  let mouth = arc(c - o, vec2<f32>(0.0, 0.06), 0.36, -2.25, -0.89);
  return min(eyes, min(nose, mouth));
}

fn check(c: vec2<f32>, amount: f32, scale: f32) -> f32 {
  let a = vec2<f32>(-0.42, 0.0) * scale;
  let b = vec2<f32>(-0.12, -0.3) * scale;
  let e = vec2<f32>(0.46, 0.32) * scale;
  let l1 = length(b - a);
  let l2 = length(e - b);
  let drawn = amount * (l1 + l2);
  var d = 1e3;
  if (drawn > 0.0) {
    d = segment(c, a, a + (b - a) * min(drawn / l1, 1.0));
  }
  if (drawn > l1) {
    d = min(d, segment(c, b, b + (e - b) * min((drawn - l1) / l2, 1.0)));
  }
  return d;
}

fn ink(d: f32, w: f32, px: f32) -> f32 {
  return 1.0 - smoothstep(w - px, w + px, d);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let c = ndc * vec2<f32>(u.resolution.z, 1.0) * 1.05;
  let px = 2.4 / u.resolution.y;
  let faceAmt = u.live.x;
  let ring = u.live.y;
  let checkAmt = u.live.z;
  let reader = u.live.w;
  let done = u.liveData[0].x;
  let spin = u.liveData[0].y;
  let nod = u.liveData[0].z;

  var white = 0.0;
  var blue = 0.0;

  let r = length(c);
  let ang = atan2(c.y, c.x);
  let dashes = abs(fract((ang + spin) / 6.2832 * 16.0) - 0.5) * 2.0;
  let ringD = max(abs(r - 0.78), (dashes - 0.55) * 0.12);
  let shapeD = mix(brackets(c), ringD, ring);
  let frameVis = max(faceAmt, checkAmt) * (1.0 - checkAmt * ring);
  white = max(white, ink(shapeD, STROKE, px) * frameVis);
  white = max(white, ink(face(c, nod), STROKE, px) * faceAmt * (1.0 - ring));
  white = max(white, ink(check(c, checkAmt, 0.9), STROKE * 1.2, px) * step(0.001, checkAmt));

  let pulse = fract(u.time.x * 0.7);
  let phoneQ = abs(c - vec2<f32>(0.0, -0.02)) - vec2<f32>(0.25, 0.43) + 0.11;
  let phoneD = length(max(phoneQ, vec2<f32>(0.0))) + min(max(phoneQ.x, phoneQ.y), 0.0) - 0.11;
  let phoneFill = 1.0 - smoothstep(-px, px, phoneD);
  let island = segment(c, vec2<f32>(-0.07, 0.3), vec2<f32>(0.07, 0.3));
  var readerInk = ink(abs(phoneD), STROKE * 0.75, px);
  readerInk = max(readerInk, ink(island, STROKE * 0.6, px));
  readerInk = max(readerInk, ink(abs(r - 0.86), STROKE * 0.9, px));
  blue = max(blue, readerInk * reader);
  blue = max(blue, phoneFill * 0.22 * reader);
  let ringR = 0.86 + pulse * 0.16;
  let ripple = ink(abs(r - ringR), STROKE * 0.6, px) * (1.0 - pulse) * 0.6 * reader;
  blue = max(blue, ripple);

  let disc = (1.0 - smoothstep(0.82 * done - px, 0.82 * done + px, r)) * step(0.001, done);
  let tick = ink(check(c, clamp(done * 1.6 - 0.4, 0.0, 1.0), 0.75), STROKE * 1.25, px);

  var col = mix(BLUE, vec3<f32>(0.92), step(0.001, white));
  var alpha = white;
  col = mix(col, BLUE, blue);
  alpha = max(alpha, blue);
  col = mix(col, BLUE, disc);
  alpha = max(alpha, disc);
  col = mix(col, vec3<f32>(1.0), tick * disc);
  return vec4<f32>(col * alpha, alpha);
}
`;
