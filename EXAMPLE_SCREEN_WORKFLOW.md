# Example-screen build workflow (agent runbook)

How to build a batch of example-app shader screens with subagents: one builder and one
reviewer per screen, each screen on its own branch, branches stacked. Written after running
it for [issue #31](https://github.com/blazejkustra/react-native-effects/issues/31); the
"State" section at the bottom says how far that run got.

The point of the shape: a builder writes and verifies, a reviewer scores it cold and fixes
what is weak, and the two land as separate commits so the score → delta is visible in the
history. On the first screen the reviewer caught a bug that the builder's own device testing
had missed, because the broken state still looked plausible. That is the whole justification
for the second pass.

## The loop

Per screen, in order:

1. **Orchestrator** creates the branch off the previous screen's tip and drops a placeholder
   thumbnail (see "The `require()` trap").
2. **Builder agent** writes the component + hook + screen, registers it, verifies it on the
   simulator, captures a real thumbnail. Does not touch git.
3. **Orchestrator** runs `yarn lint && yarn typecheck`, commits as `feat: add <thing> example`.
4. **Reviewer agent** scores against the fixed rubric, fixes anything failing or below 8,
   re-verifies on device. Does not touch git.
5. **Orchestrator** commits as `fix: …`, then branches the next screen off that tip.

One screen at a time. There is a single simulator and a single Metro, so builder and reviewer
must never overlap.

### Who is a fork and who is fresh

- **Builders are forks** of the orchestrating session (`subagent_type: "fork"`). They inherit
  the repo orientation and the WGSL gotchas from memory, which is the difference between a
  working shader and a blank canvas.
- **Reviewers are fresh** (`general-purpose`). Seeing the screen cold is the point — a fork
  would inherit the builder's assumptions about what the screen is supposed to look like.

### Git discipline

The orchestrator owns every commit. Briefs must say so explicitly: agents run no
`checkout`, `switch`, `branch`, `stash`, `commit`, `add`, `reset`, `merge`, `rebase`.
Read-only git is fine. With a dozen sequential agents in one working tree, anything else
turns the stack into guesswork.

Stage explicit paths, never `git add -A` — `example/.argent/` is untracked recording junk
that is not gitignored.

`lefthook` runs eslint + tsc on pre-commit and commitlint on commit-msg, so a dirty tree
stalls the loop. Run both from the repo root before committing rather than discovering it
in the hook.

## Environment

- Metro on 8081, started once, never restarted by an agent.
- One pinned simulator UDID in every brief. Two booted sims and the agents drift apart.
- **No native rebuilds.** These screens are all JS + WGSL and hot-reload. Briefs forbid
  `expo prebuild`, `pod install`, `yarn example ios`, and new native deps; an agent that
  thinks it needs one must stop and report rather than install it.
- If argent `screenshot` / `gesture-tap` / `launch-app` fail with "Unable to lookup
  com.apple.CoreSimulator.CoreSimulatorService … sandbox profile", the shared argent
  tool-server is stale — a process older than the current CoreSimulatorService holds a dead
  bootstrap namespace, and the permissions advice in the error text is a red herring.
  `argent server stop`; the next tool call respawns it. `xcrun simctl io <udid> screenshot`
  and `debugger-evaluate` keep working meanwhile, but nothing can tap.
- `debugger-evaluate` may need Metro's `logicalDeviceId` (from `debugger-connect`) instead
  of the UDID when a physical phone is also attached to Metro — the UDID form errors with
  "2 devices are connected".
- Tell the peer session before starting. `types.ts`, `App.tsx` and `HomeScreen.tsx` are
  co-edited, and this workflow touches all three on every screen. Tell it again when the
  tree is free.

## Things that will bite

**Procedural object scenes get deleted.** The snow globe drew its glass, firs, house and snow
in WGSL, passed review at 8.5, and the maintainer removed it from main. The candle's first version
(drawn candle + room) got the same reaction until it became a cake photo with a flame overlay.
The one procedural object that survived, the 8-ball, did so only after the user rebuilt it
(`7837033`) with a single consistent studio-lighting environment. Source the photo first
(Wikimedia Commons API, see the `subject-mask-atlas-technique` memory), build the mask/atlas,
and spend the shader budget on the physics of the disturbance. Builders should read
`git show 7837033` for the user's taste before designing anything.

**The `require()` trap.** `image: require('../../assets/components/x.png')` fails Metro
resolution if the PNG does not exist, and that red-screens the *whole app*, so the builder
cannot verify anything. Copy an existing 512×512 thumbnail into place *before* spawning the
builder, and have the builder overwrite the contents at the end with a real capture. Same
reason to register in order: screen file, then `types.ts`, then `App.tsx`, then `HomeScreen.tsx`.

**The simulator has no sensors.** No accelerometer, no mic. Every screen must expose
`__DEV__`-only debug globals, installed on mount and deleted on unmount, following the
existing `__candleBlow` / `__cigTilt` / `__beerFeed` precedent:

- an impulse: `__snowShake(strength)`, `__ballShake(strength)`
- a sticky sensor override that `null` releases: `__snowTilt(rad | null)`
- a state dump: `__snowState()`, `__ballState()`

Without these the reviewer cannot score the physics and will score a static frame. Make it a
hard requirement in the brief, not a suggestion.

**Fast Refresh binds globals to a stale hook instance.** After repeated hot reloads the debug
globals can point at a dead instance and report nonsense. `restart-app` and re-measure before
concluding there is a bug.

**Screenshots miss short states.** The 8-ball's submerged window is ~2.4s, shorter than the
eval → screenshot round trip. Record and sample frames instead of screenshotting and hoping.

**WGSL reserved keywords silently break the build.** Known so far: `active`, `auto`, `half`,
`patch`. Validate with `naga` after every edit. A failed hot-reload can leave the view black
until `restart-app`, so a black canvas is not automatically a shader bug.

**No backticks in WGSL comments** — the shader is a JS template literal and a stray backtick
breaks the bundle. Two builders hit this; it is in memory and still gets hit.

**Check `smoothstep(a, b, x)` edge order.** Reversed edges invert a mask silently, and the
result usually still looks like a plausible effect. This is how the snow globe shipped with
its headline interaction backwards — at rest a permanent snowfall, and shaking made it
*sparser*.

## Reviewer rubric

Fixed, so six screens produce comparable numbers. Score each 0–10 plus one overall.

| | |
|---|---|
| **(a) Real photo, disturbed** | **Hard gate.** Built on a real photograph or view-shot that the shader perturbs. A WGSL-drawn object is an automatic overall fail regardless of the other lines — the snow globe scored 8.5 on the rest of this rubric and was still removed as not good enough. Compare on-device against the kept screens (candle, cigarette, dispersion), not against an abstract idea of realism. |
| **(a′) Brief & pattern fit** | Does it match the issue's line, and the pattern — familiar object, real physics, sensor- or view-shot-driven? |
| **(b) Realism & restraint** | Resting state is at rest; a gesture is a perturbation that decays back. Strobing, perpetual motion, or a state that never settles are failures. |
| **(c) Debug hooks** | Present, installed on mount, removed on unmount — and **actually called** via `debugger-connect` + `debugger-evaluate`. Reading the code is not scoring. |
| **(d) Integration** | Registered in all three files; card copy in the same imperative voice as its neighbours; thumbnail is a real 512×512 capture, not the placeholder. |
| **(e) Code health** | `yarn lint && yarn typecheck` pass; WGSL naga-clean; no dead uniforms; comments say *why*. |
| **(f) Performance** | No visible hitching; per-fragment cost modest — the pipeline is fragment-only, so particle counts stay low. |

Rules for acting on the scores, which belong in the brief verbatim:

- Hard fail (broken, blank canvas, missing hook, placeholder thumbnail) → fix it.
- Below 8 → fix it, unless the fix needs a new native dep or a change outside this screen's
  files; then report it as a known gap with reasoning.
- 8 or above → leave it alone. **Restraint is part of the rubric: a change that makes it
  flashier is a regression.**
- Reviewer edits only this screen's files. Problems elsewhere get reported, not fixed.

## Brief templates

Both briefs share a preamble: load the `shader-react-native-effects` skill, read the named
memory files (`wgsl-reserved-keywords`, `transparent-shaderview-premultiplied-alpha`,
`shaderview-uniforms-orientation`, `wgsl-nan-from-mix-inf`, `shader-motion-gotchas`,
`shader-aesthetic-restraint`, `shader-must-read-uniforms`, `wgsl-validate-with-naga`, plus
the nearest precedent screen), then read the most recently built screen as the house-style
reference.

**Builder brief** = the issue's line for this screen, verbatim + the pattern sentence; the
three files to create; design constraints, with restraint called out; the required debug-hook
signatures; the registration order; a device-verification checklist; the environment
prohibitions; and "report under ~400 words, do not commit".

**Reviewer brief** = the issue's line again; the commit SHA to read; the rubric; the rules for
acting on scores; the same environment prohibitions; and a report shape of before-scores,
changes, after-scores, what was and was not verified, and gaps left deliberately.

Feed each builder the bugs the previous reviewer found. It is cheap and it works — the
8-ball builder was told about the `smoothstep` inversion and did not repeat it.

## Keep a ledger

A dozen sequential agents will outlive the orchestrator's context window. Append to a
scratchpad file after every step — branch, both SHAs, the score, what the reviewer changed,
what went unverified. The end-of-run report should be written from the ledger, not from
memory.

## State of the issue #31 run

As of 2026-09-14. All six ideas are built; four merged, one in PR.

| # | Screen | Branch | Status |
|---|---|---|---|
| 1 | Snow globe | `feat/snow-globe` | **Removed** by the maintainer as not good enough after review scored it 8.5 (PR #37). Fully procedural; see "Things that will bite". |
| 2 | Magic 8-ball | `feat/magic-8-ball` | **Merged** (PR #36) after the user's own rework `7837033`. |
| 3 | Dandelion | `feat/dandelion` | **Merged** (PR #37). Review 6.5 → 8. |
| 4 | Hourglass Pomodoro | `feat/hourglass-pomodoro` | **Merged** (PR #38). Review 6 → 8. |
| 5 | Telegram spoiler | `feat/telegram-spoiler` | **Merged** (PR #38). Review 7.5 → 8.5. |
| 6 | iMessage send effects | `feat/imessage-effects` | **In PR** (#39). Review 7.6 → 8.5. Invisible ink dropped by the user mid-build; five screen effects shipped. |

Carried-forward gaps on every sensor screen: gains are untuned on real hardware (the sim has no
accelerometer or mic, so only the debug hooks were exercised), Android is untested, and there is
no GPU frame-time measurement. Two crashes were seen in react-native-audio-api's recorder
teardown on the sim (candle and dandelion share that path) — library, not the screens.

What the reviewers actually caught, for calibration: an inverted `smoothstep` (snow globe), a
release order whose first slice held no visible seeds (dandelion), an atlas channel multiplied
to zero (hourglass), sparks flung outside the bubble and a hook that lied about refusing
(spoiler), `half` as a WGSL identifier and an echo that never left the bubble (iMessage). Every
one passed the builder's own device check, and every one was visible in a recording.
