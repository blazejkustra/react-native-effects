export const DESERT_SHADER = /* wgsl */ `
struct DesertParams {
  resolution: vec4<f32>,
  time_vec: vec4<f32>,
  colors: vec4<f32>,
  scalars: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: DesertParams;

const FAR: f32 = 80.0;
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.2831853;

fn rot2(a: f32) -> mat2x2<f32> {
  let c = cos(a);
  let s = sin(a);
  return mat2x2<f32>(c, s, -s, c);
}

fn hash31(p: vec3<f32>) -> f32 {
  return fract(sin(dot(p, vec3<f32>(21.71, 157.97, 113.43))) * 45758.5453);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  let n = sin(dot(p, vec2<f32>(113.0, 1.0)));
  let result = fract(vec2<f32>(2097152.0, 262144.0) * n) * 2.0 - 1.0;
  return result;
}

fn gradN2D(f_in: vec2<f32>) -> f32 {
  let p = floor(f_in);
  var f = f_in - p;
  let w = f * f * (3.0 - 2.0 * f);
  
  let c = mix(
    mix(dot(hash22(p + vec2<f32>(0.0, 0.0)), f - vec2<f32>(0.0, 0.0)), 
        dot(hash22(p + vec2<f32>(1.0, 0.0)), f - vec2<f32>(1.0, 0.0)), w.x),
    mix(dot(hash22(p + vec2<f32>(0.0, 1.0)), f - vec2<f32>(0.0, 1.0)), 
        dot(hash22(p + vec2<f32>(1.0, 1.0)), f - vec2<f32>(1.0, 1.0)), w.x),
    w.y
  );
  
  return c * 0.5 + 0.5;
}

fn fBm2(p_in: vec2<f32>) -> f32 {
  var p = p_in;
  return gradN2D(p) * 0.57 + gradN2D(p * 2.0) * 0.28 + gradN2D(p * 4.0) * 0.15;
}

fn n2D(p_in: vec2<f32>) -> f32 {
  let i = floor(p_in);
  var p = p_in - i;
  p = p * p * (3.0 - p * 2.0);

  let p1_input = vec2<f32>(0.0, 1.0) + dot(i, vec2<f32>(1.0, 113.0));
  let p1_mod = p1_input - TAU * floor(p1_input / TAU);
  
  let p2_input = vec2<f32>(113.0, 114.0) + dot(i, vec2<f32>(1.0, 113.0));
  let p2_mod = p2_input - TAU * floor(p2_input / TAU);
  
  let val = dot(
    mat2x2<f32>(
      fract(sin(p1_mod) * 43758.5453),
      fract(sin(p2_mod) * 43758.5453)
    ) * vec2<f32>(1.0 - p.y, p.y),
    vec2<f32>(1.0 - p.x, p.x)
  );
  
  return val;
}

fn n3D(p_in: vec3<f32>) -> f32 {
  let s = vec3<f32>(113.0, 157.0, 1.0);
  let ip = floor(p_in);
  var p = p_in - ip;
  var h = vec4<f32>(0.0, s.y, s.z, s.y + s.z) + dot(ip, s);
  p = p * p * (3.0 - 2.0 * p);
  h = mix(fract(sin(h) * 43758.5453), fract(sin(h + s.x) * 43758.5453), p.x);
  let h_xy = mix(h.xz, h.yw, p.y);
  return mix(h_xy.x, h_xy.y, p.z);
}

fn fBm3(p_in: vec3<f32>) -> f32 {
  var p = p_in;
  return n3D(p) * 0.57 + n3D(p * 2.0) * 0.28 + n3D(p * 4.0) * 0.15;
}

fn grad(x_in: f32, offs: f32) -> f32 {
  var x = abs(fract(x_in / 6.283 + offs - 0.25) - 0.5) * 2.0;
  let x2 = clamp(x * x * (-1.0 + 2.0 * x), 0.0, 1.0);
  x = smoothstep(0.0, 1.0, x);
  return mix(x, x2, 0.15);
}

fn sandL(p_in: vec2<f32>) -> f32 {
  var q = rot2(PI / 18.0) * p_in;
  q.y += (gradN2D(q * 18.0) - 0.5) * 0.05;
  let grad1 = grad(q.y * 80.0, 0.0);
  
  q = rot2(-PI / 20.0) * p_in;
  q.y += (gradN2D(q * 12.0) - 0.5) * 0.05;
  let grad2 = grad(q.y * 80.0, 0.5);
  
  q = rot2(PI / 4.0) * p_in;
  let a2 = dot(sin(q * 12.0 - cos(q.yx * 12.0)), vec2<f32>(0.25)) + 0.5;
  let a1 = 1.0 - a2;
  
  let c = 1.0 - (1.0 - grad1 * a1) * (1.0 - grad2 * a2);
  
  return c;
}

var<private> gT: f32;

fn sand(p_in: vec2<f32>) -> f32 {
  var p = vec2<f32>(p_in.y - p_in.x, p_in.x + p_in.y) * 0.7071 / 4.0;
  
  let c1 = sandL(p);
  
  let q = rot2(PI / 12.0) * p;
  let c2 = sandL(q * 1.25);
  
  let result = mix(c1, c2, smoothstep(0.1, 0.9, gradN2D(p * vec2<f32>(4.0))));
  
  return result / (1.0 + gT * gT * 0.015);
}

fn path(z: f32) -> vec2<f32> {
  return vec2<f32>(4.0 * sin(z * 0.1), 0.0);
}

fn surfFunc(p_in: vec3<f32>) -> f32 {
  var p = p_in / 2.5;
  
  var layer1 = n2D(p.xz * 0.2) * 2.0 - 0.5;
  layer1 = smoothstep(0.0, 1.05, layer1);
  
  var layer2 = n2D(p.xz * 0.275);
  layer2 = 1.0 - abs(layer2 - 0.5) * 2.0;
  layer2 = smoothstep(0.2, 1.0, layer2 * layer2);
  
  let layer3 = n2D(p.xz * 1.5);
  let res = layer1 * 0.7 + layer2 * 0.25 + layer3 * 0.05;
  return res;
}

fn map(p: vec3<f32>) -> f32 {
  let sf = surfFunc(p);
  return p.y + (0.5 - sf) * 2.0;
}

fn trace(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
  var t = 0.0;
  var h = 0.0;
  
  for (var i = 0; i < 96; i++) {
    h = map(ro + rd * t);
    if (abs(h) < 0.001 * (t * 0.125 + 1.0) || t > FAR) {
      break;
    }
    t += h;
  }
  
  return min(t, FAR);
}

fn normal(p: vec3<f32>, ef: f32) -> vec3<f32> {
  let e = vec2<f32>(0.001, 0.0);
  return normalize(vec3<f32>(
    map(p + vec3<f32>(e.x, 0.0, 0.0) * ef) - map(p - vec3<f32>(e.x, 0.0, 0.0) * ef),
    map(p + vec3<f32>(0.0, e.x, 0.0) * ef) - map(p - vec3<f32>(0.0, e.x, 0.0) * ef),
    map(p + vec3<f32>(0.0, 0.0, e.x) * ef) - map(p - vec3<f32>(0.0, 0.0, e.x) * ef)
  ));
}

fn bumpSurf3D(p: vec3<f32>) -> f32 {
  let n = surfFunc(p);
  let px = p + vec3<f32>(0.001, 0.0, 0.0);
  let nx = surfFunc(px);
  let pz = p + vec3<f32>(0.0, 0.0, 0.001);
  let nz = surfFunc(pz);
  
  return sand(p.xz + vec2<f32>(n - nx, n - nz) / 0.001 * 1.0);
}

fn doBumpMap(p: vec3<f32>, nor: vec3<f32>, bumpfactor: f32) -> vec3<f32> {
  let e = vec2<f32>(0.001, 0.0);
  
  let baseVal = bumpSurf3D(p);
  var grad = (vec3<f32>(
    bumpSurf3D(p - vec3<f32>(e.x, 0.0, 0.0)),
    bumpSurf3D(p - vec3<f32>(0.0, e.x, 0.0)),
    bumpSurf3D(p - vec3<f32>(0.0, 0.0, e.x))
  ) - baseVal) / e.x;
  
  grad -= nor * dot(nor, grad);
  
  return normalize(nor + grad * bumpfactor);
}

fn softShadow(ro: vec3<f32>, lp: vec3<f32>, k: f32, t: f32) -> f32 {
  var rd = lp - ro;
  var shade = 1.0;
  var dist = 0.0015;
  let end = max(length(rd), 0.0001);
  rd = rd / end;
  
  for (var i = 0; i < 24; i++) {
    let h = map(ro + rd * dist);
    shade = min(shade, k * h / dist);
    let h_clamped = clamp(h, 0.1, 0.5);
    dist += h_clamped;
    
    if (shade < 0.001 || dist > end) {
      break;
    }
  }
  
  return min(max(shade, 0.0) + 0.05, 1.0);
}

fn calcAO(p: vec3<f32>, n: vec3<f32>) -> f32 {
  var ao = 0.0;
  let maxDist = 4.0;
  let nbIte = 5.0;
  
  for (var i = 1.0; i < nbIte + 0.5; i += 1.0) {
    let l = (i + 0.0) * 0.5 / nbIte * maxDist;
    ao += (l - map(p + n * l));
  }
  
  return clamp(1.0 - ao / nbIte, 0.0, 1.0);
}

fn getSky(ro: vec3<f32>, rd_in: vec3<f32>, ld: vec3<f32>) -> vec3<f32> {
  let col = vec3<f32>(0.8, 0.7, 0.5);
  let col2 = vec3<f32>(0.4, 0.6, 0.9);
  
  var sky = mix(col, col2, pow(max(rd_in.y + 0.15, 0.0), 0.5));
  sky *= vec3<f32>(0.84, 1.0, 1.17);
  
  var sun = clamp(dot(ld, rd_in), 0.0, 1.0);
  sky += vec3<f32>(1.0, 0.7, 0.4) * vec3<f32>(pow(sun, 16.0)) * 0.2;
  sun = pow(sun, 32.0);
  sky += vec3<f32>(1.0, 0.9, 0.6) * vec3<f32>(pow(sun, 32.0)) * 0.35;
  
  var rd = rd_in;
  rd.z *= 1.0 + length(rd.xy) * 0.15;
  rd = normalize(rd);
  
  let SC = 1e5;
  let t = (SC - ro.y - 0.15) / (rd.y + 0.15);
  let uv = (ro + t * rd).xz;
  
  if (t > 0.0) {
    sky = mix(sky, vec3<f32>(2.0), 
      smoothstep(0.45, 1.0, fBm3(vec3<f32>(uv / SC * 1.5, 0.0))) *
      smoothstep(0.45, 0.55, rd.y * 0.5 + 0.5) * 0.4);
  }
  
  return sky;
}

fn getMist(ro: vec3<f32>, rd: vec3<f32>, lp: vec3<f32>, t: f32) -> f32 {
  var mist = 0.0;
  var t0 = 0.0;
  
  for (var i = 0; i < 24; i++) {
    if (t0 > t) {
      break;
    }
    
    let sDi = length(lp - ro) / FAR;
    let sAtt = 1.0 / (1.0 + sDi * 0.25);
    
    let ro2 = (ro + rd * t0) * 2.5;
    let c = n3D(ro2) * 0.65 + n3D(ro2 * 3.0) * 0.25 + n3D(ro2 * 9.0) * 0.1;
    let n = c;
    mist += n * sAtt;
    
    t0 += clamp(c * 0.25, 0.1, 1.0);
  }
  
  return max(mist / 48.0, 0.0);
}

@fragment
fn main(@location(0) ndc: vec2<f32>) -> @location(0) vec4<f32> {
  let time = params.time_vec.x;
  let speed = params.scalars.x;
  let sandDetail = params.scalars.y;
  let bumpIntensity = params.scalars.z;
  let mistIntensity = params.scalars.w;
  
  let resolution = params.resolution.xy;
  let aspect = params.resolution.z;
  
  var u = ndc;
  u.y *= aspect;
  
  var ro = vec3<f32>(0.0, 1.2, time * 2.0 * speed);
  var lookAt = ro + vec3<f32>(0.0, -0.15, 0.5);
  
  ro = ro + vec3<f32>(path(ro.z), 0.0);
  lookAt = lookAt + vec3<f32>(path(lookAt.z), 0.0);
  
  let sfH2 = surfFunc(lookAt);
  ro.y += sfH2;
  lookAt.y += sfH2;
  
  let FOV = PI / 2.5;
  let forward = normalize(lookAt - ro);
  let right = normalize(vec3<f32>(forward.z, 0.0, -forward.x));
  let up = cross(forward, right);
  var rd = normalize(forward + FOV * u.x * right + FOV * u.y * up);
  
  let lp = vec3<f32>(FAR * 0.25, FAR * 0.25, FAR) + vec3<f32>(0.0, 0.0, ro.z);
  let t = trace(ro, rd);
  
  gT = t;
  
  var col = vec3<f32>(0.0);
  
  let sp = ro + t * rd;
  let pathHeight = sp.y;
  
  if (t < FAR) {
    var sn = normal(sp, 1.0);
    
    var ld = lp - sp;
    let lDist = max(length(ld), 0.001);
    ld = ld / lDist;
    
    let lDistNorm = lDist / FAR;
    let atten = 1.0 / (1.0 + lDistNorm * lDistNorm * 0.025);
    
    sn = doBumpMap(sp, sn, 0.07 * bumpIntensity);
    
    let sh = softShadow(sp + sn * 0.002, lp, 6.0, t);
    let ao = calcAO(sp, sn);
    
    let sh_final = min(sh + ao * 0.25, 1.0);
    
    let dif = max(dot(ld, sn), 0.0);
    let spe = pow(max(dot(reflect(-ld, sn), -rd), 0.0), 5.0);
    let fre = clamp(1.0 + dot(rd, sn), 0.0, 1.0);
    
    let Schlick = pow(1.0 - max(dot(rd, normalize(rd + ld)), 0.0), 5.0);
    let fre2 = mix(0.2, 1.0, Schlick);
    
    let amb = ao * 0.35;
    
    col = mix(vec3<f32>(1.0, 0.95, 0.7), vec3<f32>(0.9, 0.6, 0.4), fBm3(vec3<f32>(sp.xz * 16.0 * sandDetail, 0.0)));
    col = mix(col * 1.4, col * 0.6, fBm3(vec3<f32>(sp.xz * 32.0 * sandDetail - 0.5, 0.0)));
    
    let bSurf = bumpSurf3D(sp);
    col *= bSurf * 0.75 + 0.5;
    
    col = mix(col * 0.7 + (hash31(floor(sp * 96.0)) * 0.7 + hash31(floor(sp * 192.0)) * 0.3) * 0.3, 
              col, min(t * t / FAR, 1.0));
    
    col *= vec3<f32>(1.2, 1.0, 0.9);
    
    col = col * (dif + amb + vec3<f32>(1.0, 0.97, 0.92) * fre2 * spe * 2.0) * atten;
    
    let refSky = getSky(sp, reflect(rd, sn), ld);
    col += col * refSky * 0.05 + refSky * fre * fre2 * atten * 0.15;
    
    col *= sh_final * ao;
  }
  
  let dust = getMist(ro, rd, lp, t) * (1.0 - smoothstep(0.0, 1.0, pathHeight * 0.05));
  let gLD = normalize(lp - vec3<f32>(0.0, 0.0, ro.z));
  let sky = getSky(ro, rd, gLD);
  col = mix(col, sky, smoothstep(0.0, 0.95, t / FAR));
  
  let mistCol = vec3<f32>(1.0, 0.95, 0.9);
  
  col += vec3<f32>(1.0, 0.6, 0.2) * pow(max(dot(rd, gLD), 0.0), 16.0) * 0.45;
  
  col = col * 0.75 + (col + 0.25 * vec3<f32>(1.2, 1.0, 0.9)) * mistCol * dust * 1.5 * mistIntensity;
  
  let uv = (ndc + 1.0) * 0.5;
  col = min(col, vec3<f32>(1.0)) * pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.0625);
  
  col = col * params.colors.rgb;
  
  return vec4<f32>(sqrt(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0))), params.colors.a);
}
`;
