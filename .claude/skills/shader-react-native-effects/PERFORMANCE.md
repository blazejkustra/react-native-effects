# Shader Performance

## The cost model

Your fragment function runs for **every pixel, every frame**: a 390×844 pt view at 3× DPR is ~2.96M fragment invocations per frame, ×60 fps. There is no resolution-scaling prop — the only lever is what the fragment does. Mid-range Android GPUs have roughly 1/5 the fragment throughput of a recent iPhone, so budget for them, not the simulator.

Two facts work in your favor:
- The render loop runs **off the JS thread** — a heavy shader degrades to lower fps but never blocks JS, touch, or navigation.
- There is no texture sampling — the whole cost is ALU, which is the easiest cost to reason about and trim.

## Budgets (set before writing, not after)

| Item | Budget | Notes |
| --- | --- | --- |
| fbm octaves | **4** (3 on full-screen effects) | Each octave = 4 hashes + 3 mixes. The rotation matrix between octaves is what lets 3–4 octaves look like 6 |
| fbm/noise calls per pixel | 1–2 | Compute a warp field ONCE, reuse it across layers (see HoloFoilCard's `warp`) |
| Nested fbm (domain warp of a warp) | 1 level | `fbm(p + fbm(p))` is already octaves² — never go deeper on mobile |
| 3D simplex noise calls | 1 | ~3× cost of 2D value noise; use only when the pattern must evolve in place (fire, smoke). Otherwise scroll 2D noise: `vnoise(p + vec2(t*a, t*b))` |
| Particle/star loops | ≤ 24 iterations, constant bound | Constant bounds unroll; per-iteration work must be a few ops. For more particles, fake density with thresholded high-freq hash instead |
| `pow()` | avoid in hot paths | Prefer `x*x`, `exp(-x*x*k)` gaussians, `exp2` |

## Cheap vs expensive

**Cheap (use freely):** `sin/cos`, `exp`, `mix`, `smoothstep`, `dot`, `fract`, `floor`, swizzles, `mat2x2` multiply, `select()`.

**Watch out for:**
- `length()` when you only compare distances — use `dot(d, d)` against a squared threshold.
- `normalize()`/`sqrt` inside loops.
- Divergent branching: an `if` on a per-pixel value makes neighboring pixels execute both sides. Prefer `select()`/`smoothstep` masks. Branches on uniforms (`u.params0.x > 0.5`) are free — use them to gate whole features.
- Dynamic array indexing with a non-constant index — can spill to slow memory; prefer unrolled constant loops.

## Hoist work out of the shader entirely

The fragment shader can't hoist per-frame constants to the CPU — but **you** can:
- Anything derivable from props alone (precomputed angles, `cos/sin` of a fixed rotation, normalized weights) → compute in JS, pass via `params`. 8 floats of free per-pixel work.
- Anything derivable from a live value (smoothed audio envelope, eased scroll) → compute in the JS handler, write via `setParamsSynchronizable`. Smoothing in JS is once-per-event; smoothing in WGSL is once-per-pixel.

## Component-level levers

- **`isStatic={true}`** for anything that doesn't animate — renders one frame, stops the rAF loop, zero ongoing GPU cost. A `speed={0}` shader still renders every frame; use `isStatic`.
- **Size the view to the effect.** Pixels cost the same whether they output alpha 0 or a complex color. A transparent full-screen overlay for a small badge pays full-screen price — wrap the badge instead.
- **Live input via `paramsSynchronizable`, never props.** Updating `params` through React state at gesture rate re-renders the component every event and stutters; `u.live` is read off-thread each frame for free.
- Multiple simultaneous ShaderViews each run their own loop — fine for 2–3 small views, but prefer one shader compositing several elements over N stacked full-screen ShaderViews.

## Quality-preserving degradations

When an effect is too heavy, cut in this order (least visible first):
1. Reuse one noise/warp sample across layers instead of resampling per layer.
2. Drop one fbm octave and compensate with +10–15% amplitude on the remaining micro-detail layer (streaks, sparkle — they're nearly free).
3. Replace 3D simplex with scrolled 2D value noise.
4. Replace per-pixel loops (particles) with hash-threshold density fields.
5. Reduce layers — but never below 2, and keep the dither (1 hash; removing it saves nothing and bands visibly).

## Measuring

GPU fragment cost is invisible to the JS profiler — judge it by frame pacing on a real device:
1. Run the example app on the **slowest device available** (low-end Android emulator is pessimistic-but-useful; the iOS simulator renders on the host GPU and proves nothing about performance).
2. Watch the effect's own animation for hitching, and interact (scroll/touch) while it runs — use the argent tools to drive and screenshot.
3. A/B by bisection: comment out layers (`return` early with partial color) to find which layer dominates, then apply the degradation ladder above to that layer only.
4. On iOS hardware, Xcode's GPU report / Instruments (via `argent-native-profiler`) gives real fragment-time numbers when it matters.
