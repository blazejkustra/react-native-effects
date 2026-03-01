import { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import { ShaderView } from 'react-native-effects';

type Props = ViewProps & {
  /** Animation speed multiplier. Default: 1.0 */
  speed?: number;
  /** Splash density (0-2). Default: 1.0 */
  intensity?: number;
};

export default function RainSplash({
  speed = 1.0,
  intensity = 10.0,
  ...viewProps
}: Props) {
  const params = useMemo(() => [intensity, Math.random() * 1000], [intensity]);

  return (
    <ShaderView
      fragmentShader={RAIN_SPLASH_SHADER}
      params={params}
      speed={speed}
      isStatic={false}
      {...viewProps}
    />
  );
}

const RAIN_SPLASH_SHADER = /* wgsl */ `
struct Uniforms {
  resolution: vec4<f32>,
  time:       vec4<f32>,
  color0:     vec4<f32>,
  color1:     vec4<f32>,
  params0:    vec4<f32>,
  params1:    vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(
    fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2<f32>(269.5, 183.3))) * 43758.5453)
  );
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = u.time.x;
  let intensity = u.params0.x;
  let seed = u.params0.y;

  let uv = ndc * 0.5 + 0.5;
  let res = vec2<f32>(u.resolution.x, u.resolution.y);
  let px = uv * res;

  var acc = 0.0;

  let groundY = 0.01;

  // Splash sites — each one shifts position every cycle
  for (var i = 0; i < 12; i++) {
    let id = vec2<f32>(f32(i), seed);
    let rnd = hash22(id);

    let cycleDur = 0.25 + rnd.y * 0.45;
    let phase = hash21(id + vec2<f32>(3.7, 0.0));
    // Which cycle we're on — used to re-randomize position each cycle
    let cycleIndex = floor(time / cycleDur + phase);
    let t = fract(time / cycleDur + phase);

    // Re-hash position each cycle so splashes appear at different spots
    let cycleId = vec2<f32>(f32(i), cycleIndex + seed);
    let posRnd = hash22(cycleId);
    let baseX = posRnd.x * res.x;
    // Vary ground Y slightly per splash
    let localGround = groundY + (posRnd.y - 0.5) * res.y * 0.04;

    // Fan of droplets spraying outward from impact point
    let dropCount = 3 + i32(hash21(cycleId + vec2<f32>(77.0, 0.0)) * 3.0);

    for (var j = 0; j < 6; j++) {
      if (j >= dropCount) { break; }
      let djRnd = hash22(vec2<f32>(cycleIndex + f32(i), f32(j) + seed + 10.0));

      // Fan angle: spread evenly across ~160° arc with jitter
      let baseAngle = (f32(j) / f32(dropCount)) * 3.14159 - 0.1;
      let angle = baseAngle + (djRnd.x - 0.5) * 0.5;

      // Each droplet has a random ejection speed
      let speed2 = (6.0 + djRnd.y * 16.0) * u.resolution.w;
      let vx = cos(angle) * speed2;
      let vy = sin(angle) * speed2;

      // Stagger start
      let delay = djRnd.x * 0.1;
      let dt = clamp((t - delay) / (1.0 - delay), 0.0, 1.0);

      // Gravity pulls droplets back down (toward ground = negative arcY)
      let gravity = 40.0 * u.resolution.w;
      let dotX = baseX + vx * dt;
      let arcY = vy * dt - 0.5 * gravity * dt * dt;
      let dotY = localGround + max(arcY, 0.0);

      let d = length(px - vec2<f32>(dotX, dotY));
      let r = (1.0 + djRnd.y * 1.2) * u.resolution.w;
      let vis = 1.0 - smoothstep(0.0, r, d);
      // Visible only while above ground
      let alive = step(0.0, arcY);
      let fadeOut = 1.0 - smoothstep(0.5, 1.0, dt);
      acc += vis * alive * fadeOut * intensity;
    }
  }

  let a = clamp(acc * 0.04, 0.0, 0.65);
  return vec4<f32>(a, a, a, a);
}
`;
