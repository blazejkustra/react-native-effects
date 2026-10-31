# Asset provenance audit

Audited 2026-10-30 from git history, source comments, project notes, EXIF and the Wikimedia Commons API. Paths are relative to `example/assets`. There are no bundled sound files or fonts: every sound is synthesized in code, and text uses system fonts.

## Blockers: resolved on 2026-10-31

Every blocker from the audit of 2026-10-30 is out of the app. Licences of the new Commons sources were read from the Commons API on 2026-10-31 and are recorded in `docs/credits.md`. `example/assets/tools/generate-assets.py` rebuilds everything marked as generated.

| Old asset | Replacement |
| --- | --- |
| `foam.jpg` | Generated foam and beer texture |
| `candle/cake.jpg` | "3rd birthday cake", CC0, flame painted out and background extended |
| `namedrop/home-atlas.jpg` | `wave/scene-atlas.jpg`, "Misty path", CC0, no icons |
| `iphone-background.png` | `scenes/misty-path.jpg`, same scene |
| `wave/avatar.jpg` | `wave/dusk.jpg`, a crop of "Seaside swing at dusk", CC0, with no person in frame |
| `telegram/pattern.png` | Generated dot pattern, `chat/pattern.png` |
| `telegram/*.png`, `instagram/*.png` | Generated icons in `chat/` |
| `telegram/avatar.jpg` | Generated avatar, `chat/avatar-peaks.png` |
| `weather/*.png` | Generated icons at the same paths |
| Runtime Lorem Picsum images | Bundled: "Forest path at sunset" and "Misty path" (both CC0), two generated avatars |
| `catalog/*.jpg` showing other products | Retaken from the app after the screens changed, or deleted with their screen |
| `charizard.png` | Deleted |

## Needs care

- **SF Symbols.** The flashlight PNGs are deleted. The screen now uses plain sliders and a text button, so no SF Symbol assets remain.
- **Portrait release.** Black Rock beach shows real people, and Commons flags personality rights on it. CC licences cover copyright only. Keep it out of store screens.
- **ShareAlike.** The BY-SA images are adapted, so the adapted files must also be available under BY-SA. This repository is public, which works, as long as those files stay in it. The MIT license of the code does not extend to them. `docs/credits.md` states this.
- **DRM clause.** CC licences restrict adding technical measures to licensed works, and Apple's FairPlay wraps the app binary. Parallel distribution of the same images in the public repository is the usual mitigation. CC0 or CC BY 4.0 replacements remove the question.

## Clean

Verified against the Commons API on 2026-10-30, author and licence match `docs/credits.md`: `flashlight/corridor.jpg`, `camera/photo-*.jpg`, `camera/table.jpg` and `bubblewrap/walnut.jpg` (Lorenz), `dandelion/dandelion-atlas.jpg`, `hourglass/hourglass-atlas.jpg`, `dispersion/cat-atlas.png`, `lavalamp/lava-lamp.jpg`, `cracks/palms.jpg`, `cracks/swing.jpg`, `ferrofluid/marble.jpg`.

Original to the project: `icon.png`, `splash-icon.png`, `adaptive-icon.png`, `favicon.png` (present from the initial commit, please confirm you made them), and the other `catalog/*.jpg` thumbnails, which are screenshots of this app.
