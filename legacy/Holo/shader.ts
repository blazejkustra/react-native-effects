export const HOLO_SHADER = /* wgsl */ `
struct Uniforms {
  screenProps: vec4<f32>,  // width, height, aspect, padding
  tilt: vec4<f32>,         // x, y touch position (-1 to 1)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var imageSampler: sampler;
@group(0) @binding(2) var imageTexture: texture_2d<f32>;

const PI: f32 = 3.14159265359;
const TWO_PI: f32 = 6.28318530718;

// ---- Enhanced Tunables for Beautiful Effect ----
const DOT_COUNT: f32 = 25.0;        // More dots for finer detail
const RAINBOW_OFFSET: f32 = -0.5;   // Shifted rainbow
const MASK_OFFSET: f32 = 7;         // Pattern angle
const INTENSITY: f32 = 0.7;         // Increased intensity for richer colors
const DOT_STRENGTH: f32 = 0.3;      // Stronger dot pattern
const HUE_SCALE: f32 = 3.0;         // More vibrant rainbow spread
const ZOOM: f32 = 0.85;             // Better zoom level
const PARALLAX_SCALE: f32 = 0.08;   // Stronger parallax for depth

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

fn getRainbowColor(uv: vec2<f32>) -> vec3<f32> {
  let x = uv.x;
  var col = hsv2rgb(vec3<f32>(x * HUE_SCALE + RAINBOW_OFFSET, 1.0, 1.0));
  let s = sin(x * TWO_PI + MASK_OFFSET);
  return clamp(col * s, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn getDotPattern(uv: vec2<f32>, dotStrength: f32) -> f32 {
  let d = fract(uv * DOT_COUNT);
  let distanceToCenter = length(d - 0.5);
  let invDistanceToCenter = 1.0 - distanceToCenter;
  let invDotStrength = 1.0 - dotStrength;
  let fin = (invDistanceToCenter - invDotStrength) / max(dotStrength, 1e-5);
  return clamp(fin, 0.0, 1.0);
}

fn div_z(v: vec3<f32>) -> vec2<f32> {
  return v.xy / v.z;
}

fn makeRotationMatrix(g: f32, h: f32) -> mat3x3<f32> {
  return mat3x3<f32>(
    vec3<f32>(1.0, 0.0, g),
    vec3<f32>(0.0, 1.0, h),
    vec3<f32>(0.0, 0.0, 1.0)
  );
}

fn makeUVRotationMatrix(g: f32, h: f32) -> mat3x3<f32> {
  return mat3x3<f32>(
    vec3<f32>(g,  h,  0.0),
    vec3<f32>(-h, g,  0.0),
    vec3<f32>(0.0, 0.0, 1.0)
  );
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let uv = ndc * 0.5 + 0.5;

  // Flip Y (textures are typically top-down)
  let flippedUV = vec2<f32>(uv.x, 1.0 - uv.y);

  // Parallax offset
  let tiltOffset = uniforms.tilt.xy * PARALLAX_SCALE;
  let parallaxUV = flippedUV + tiltOffset;

  // ---- Holographic space mapping ----
  let aspect = uniforms.screenProps.z;
  let touchTilt = uniforms.tilt.xy;

  // Use the parallax-corrected UV as the base coordinate
  var coord = parallaxUV;

  // Build the warped rect space
  var p = 2.0 * coord - 1.0;               // to clip-like space (-1..1)
  p *= vec2<f32>(aspect, 1.0);             // compensate aspect
  p /= vec2<f32>(1.0, 1.4);                // artistic squeeze
  p *= ZOOM;                                // zoom

  let g = touchTilt.x * 0.8;
  let h = touchTilt.y * 0.8;

  let m = makeRotationMatrix(g, h);
  let rectUV = div_z(m * vec3<f32>(p, 1.0));

  let tileID = floor(rectUV + 0.5);
  let tiledCoord = fract(rectUV + 0.5);

  let isCenterRect = select(0.0, 1.0, all(tileID == vec2<f32>(0.0)));

  let rotateUVMat = makeUVRotationMatrix(g, h);
  let rotatedRainbowUV = (rotateUVMat * vec3<f32>(tiledCoord, 1.0)).xy;

  let dotPatternOffset = getDotPattern(tiledCoord, DOT_STRENGTH) * DOT_STRENGTH * 0.1;
  let rainbow_rgb = getRainbowColor(rotatedRainbowUV + dotPatternOffset);
  let rainbow: vec4<f32> = vec4<f32>(rainbow_rgb, 1.0);

  // ---- Image handling matches first shader semantics ----
  // Sample the image with parallax-aware coordinates in [0,1]
  // (tiledCoord is already 0..1 from fract; add a tiny parallax mod again to keep subtle depth)
  let sampleUV = clamp(tiledCoord + tiltOffset * 0.25, vec2<f32>(0.0), vec2<f32>(1.0));
  let cardArt: vec4<f32> = textureSample(imageTexture, imageSampler, sampleUV);

  // Build alpha mask from art brightness (lets holo shine in dark zones)
  let brightness = length(cardArt.rgb);
  let alpha_mask = select(1.0, 0.8, brightness > 0.1);

  // Composite holo + art with richer blending
  let holo_layer = rainbow.rgb * INTENSITY;
  let mixed_rgb = mix(holo_layer, cardArt.rgb, alpha_mask);
  var combined: vec4<f32> = vec4<f32>(mixed_rgb, cardArt.a);

  // Add beautiful sparkle and shimmer in darker areas
  let sparkle_rgb = rainbow.rgb * (1.0 - alpha_mask) * 0.8;
  
  // Add subtle chromatic shift for depth
  let shimmer = sin(rotatedRainbowUV.x * 10.0 + rotatedRainbowUV.y * 10.0) * 0.1;
  let enhanced_rgb = combined.rgb + sparkle_rgb + shimmer * rainbow.rgb * 0.2;
  
  let finalColor: vec4<f32> = vec4<f32>(enhanced_rgb, cardArt.a);

  // Only show effect in the center tile (others get a dim background)
  let bgColor: vec4<f32> = vec4<f32>(0.05, 0.05, 0.05, 1.0);
  let result = mix(bgColor, finalColor, isCenterRect);

  return result;
}
`;
