import {
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ShaderView } from 'react-native-effects';

/**
 * Foam lab: the same tilted beer three times, each with a photographed head
 * riding the surface, at the same on-screen scale as the real glass, so the
 * treatment can be picked by eye and moved into BeerGlass.
 *
 * Procedural heads (grain, cells, drawn bubbles) all read as drawn, so the
 * head is now a photo sampled in the surface-aligned frame, the way iBeer
 * does it. The photo has beer under its foam; tiles 2 and 3 key that out on
 * yellowness so the lacy seam of half-transparent bubbles is what sits on
 * our own beer.
 */
const VARIANTS = [
  '1 photo, as shot',
  '2 photo, keyed edge',
  '3 photo, keyed + whitened',
];

// Stock foam photo supplied as the reference — check its licence before it
// ships in the real glass.
const FOAM_PHOTO = require('../../assets/foam.jpg');

export default function FoamLabScreen() {
  const { height } = useWindowDimensions();
  const tileH = height / VARIANTS.length;
  // Texture frequencies in the lab are written per SCREEN height, like the
  // real glass, so scale by the tile's share of the screen.
  const scale = tileH / height;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      {VARIANTS.map((name, i) => (
        <View key={name} style={{ height: tileH }}>
          <ShaderView
            fragmentShader={FOAM_LAB_SHADER}
            texture={FOAM_PHOTO}
            colors={['#e5920a', '#fbfaf7']}
            params={[i, scale, 0, 0, 0, 0, 0, 0]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.label}>{name}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  label: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
});

const FOAM_LAB_SHADER = /* wgsl */ `
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
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// The photo: square, foam over beer, the foam's lacy bottom line at v = 0.615
// from the top. PHOTO_H is its height in screen-height units, chosen so the
// head above the seam is ~0.17 of the screen, like the iBeer head.
const PHOTO_H: f32 = 0.28;
const PHOTO_SEAM: f32 = 0.615;

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let t = u.time.x;
  let aspect = u.resolution.z;
  let uv = ndc * 0.5 + 0.5;
  let variant = i32(u.params0.x + 0.5);
  let scale = max(u.params0.y, 0.05);   // tile height / screen height
  let p = vec2<f32>((uv.x - 0.5) * aspect, uv.y);

  // A gently swaying tilted surface low in the tile, so the whole head and
  // the glass above it are in view.
  let ang = 0.12 * sin(t * 0.7);
  let dn = vec2<f32>(sin(ang), -cos(ang));
  let es = vec2<f32>(cos(ang), sin(ang));
  let ctr = vec2<f32>(0.0, 0.2);
  let depth = dot(p - ctr, dn);         // > 0 inside the beer
  let s = dot(p - ctr, es);
  // Surface-aligned frame in SCREEN-height units. fd.y grows upward:
  // positive above the surface, inside the head.
  let fd = vec2<f32>(s, -depth) * scale;
  let foamThick = PHOTO_H * PHOTO_SEAM;
  let feather = 3.0 / u.resolution.y;

  // Beer body: amber with a depth gradient and a few bubbles.
  var beer = u.color0.rgb * (1.0 - clamp(depth * 1.2, 0.0, 1.0) * 0.2);
  let bq = fd * 18.0 + vec2<f32>(0.0, -t * 1.5);
  let bc = fract(bq) - 0.5;
  let br = hash21(floor(bq));
  let bub = step(0.55, br) * smoothstep(0.12, 0.05, length(bc));
  beer = beer + vec3<f32>(1.0, 0.95, 0.8) * bub * 0.3;
  // The beer runs a little way up under the head, so the half-transparent
  // seam bubbles sit on beer, never on the dark glass.
  let inLiquid = smoothstep(0.0, feather, depth + 0.04 / scale);

  // Big soft mounds on the silhouette against the glass.
  let lumpA = vnoise(vec2<f32>(fd.x * 3.5, t * 0.05));
  let lumpB = vnoise(vec2<f32>(fd.x * 9.0 + 4.0, t * 0.08));
  let topH = foamThick * (0.55 + lumpA * 0.62 + lumpB * 0.22);
  let dFs = -fd.y;                       // screen-unit depth below surface
  let topMask = smoothstep(-topH, -topH + feather * scale, dFs);

  // The photo in the surface frame, its seam on the surface, mirrored
  // sideways so it tiles without a visible join.
  let puv = vec2<f32>(fd.x / PHOTO_H + 0.5, PHOTO_SEAM - fd.y / PHOTO_H);
  let c = textureSampleLevel(tex, samp, puv, 0.0).rgb;
  // Yellowness keys the photo's own beer out: foam is ~0.13, beer ~0.85, the
  // half-transparent seam bubbles land in between. Dark pixels (bubble rims
  // over beer) are beer too, or they survive as black specks on the seam.
  let lumn = dot(c, vec3<f32>(0.299, 0.587, 0.114));
  let beerness = max(smoothstep(0.35, 0.6, c.r - c.b),
                     1.0 - smoothstep(0.3, 0.55, lumn));

  var alpha = topMask;
  var foam = c;
  if (variant == 0) {
    // As shot: the photo's own beer stays, down to the bottom of the frame.
    alpha = alpha * step(puv.y, 1.0);
  } else {
    // Nothing of the photo below its seam band: the photo's beer has bright
    // droplets that would survive the key as specks in ours.
    alpha = alpha * (1.0 - beerness) * smoothstep(-0.014, -0.008, fd.y);
    // Half-keyed seam bubbles lose their yellow so they read as translucent
    // white over our beer, not the photo's.
    foam = mix(c, u.color1.rgb * min(lumn * 1.15, 1.0), beerness);
  }
  if (variant == 2) {
    // Toward the iBeer white: keep the photo's shading, drop its cream.
    foam = mix(foam, u.color1.rgb * lumn * 1.04, 0.6);
    // Wet where it sits on the beer.
    let wet = (1.0 - smoothstep(0.0, 0.03, fd.y)) * 0.25;
    foam = mix(foam, beer * 1.05, wet);
  }

  // Glass headspace.
  let glass = vec3<f32>(0.1, 0.065, 0.032);
  var col = mix(glass, beer, inLiquid);
  col = mix(col, foam, alpha);
  // Tile edge shading.
  let ex = abs(uv.x - 0.5) * 2.0;
  col = col * (1.0 - 0.25 * ex * ex * ex);
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;
