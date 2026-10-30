# Asset provenance audit

Audited 2026-10-30 from git history, source comments, project notes, EXIF and the Wikimedia Commons API. Paths are relative to `example/assets`. There are no bundled sound files or fonts: every sound is synthesized in code, and text uses system fonts.

## Blockers: licence incompatible, unknown or third-party owned

Each of these ships in the app bundle. Replace it or get written permission before submitting.

| Asset | Used by | What the record shows | Fix |
| --- | --- | --- | --- |
| `foam.jpg` | Beer, Foam lab | Stock photo supplied by the owner, licence never checked (the code says so too) | Find the source and license it, or shoot one |
| `candle/cake.jpg` | Birthday Candle | Cake photo pasted by the owner, then retouched. Source unknown | Find the source, or replace |
| `namedrop/home-atlas.jpg` | NameDrop | Real iOS home screen capture showing Apple app icons and wallpaper | Replace with an invented home screen |
| `iphone-background.png` | Siri Orb | Real iOS home screen capture showing Apple app icons and wallpaper | Replace with an invented home screen |
| `telegram/pattern.png` | Telegram screens | A real Telegram chat wallpaper | Draw an original pattern |
| `telegram/*.png` icons | Telegram screens | Cropped from a screen recording of Telegram | Redraw or use an MIT icon set |
| `instagram/*.png` icons | Voice Delete | Cropped from a recording of Instagram | Redraw or use an MIT icon set |
| `telegram/avatar.jpg` | Telegram screens | Identifiable man speaking on stage. No record of who took it or who he is | Confirm you own it and have consent, or swap for a credited or generated avatar |
| `weather/*.png` | Weather | No source recorded in git or notes. They look like an existing weather icon set | Identify the set, or redraw |
| `catalog/*.jpg` showing other products | Catalog thumbnails | App screenshots that show third-party marks: `holo-card.jpg` (Revolut, Monzo), `wallet.jpg` (Mastercard-style logo), `siri-orb.jpg` (Safari and Messages icons), `banners.jpg` (Duolingo), `imessage.jpg`, `telegram-*.jpg`, `voice-delete.jpg`, and `weather.jpg` | Retake after the matching screens change |

Picsum images load at runtime in Voice Delete. Lorem Picsum draws from Unsplash photographs, and the owner has no record of which ones, so bundling known images is the safer route.

## Needs care

- **SF Symbols.** `cracks/*-fill.png`, `flashlight/camera.png`, `flashlight/flashlight-off.png`, `flashlight/torch-glyph.png` and `imessage/video.png` are SF Symbols rendered to PNG (confirmed in code for the FaceTime glyph, inferred from file names for the rest). Apple's terms allow them in apps for Apple platforms and bar use in logos or app icons. Keep them out of the Android build and out of the store icon.
- **`polaroid/table.jpg` source comment is wrong.** `PolaroidScreen.tsx` credits "Weatherworn top of wooden table" (CC0), but the file's EXIF names Martin Michael Lorenz and it is visually identical to `bubblewrap/walnut.jpg`, so it is CC BY-SA 3.0. `docs/credits.md` has the correct credit.
- **Portrait release.** `namedrop/avatar.jpg` and Black Rock beach show real people, and Commons flags personality rights on the beach photo. CC licences cover copyright only. The avatar appears as a fictional contact called Maren, so leave it out of store screenshots and marketing, where it could read as an endorsement.
- **ShareAlike.** The BY-SA images are adapted, so the adapted files must also be available under BY-SA. This repository is public, which works, as long as those files stay in it. The MIT license of the code does not extend to them. `docs/credits.md` states this.
- **DRM clause.** CC licences restrict adding technical measures to licensed works, and Apple's FairPlay wraps the app binary. Parallel distribution of the same images in the public repository is the usual mitigation. CC0 or CC BY 4.0 replacements remove the question.

## Clean

Verified against the Commons API on 2026-10-30, author and licence match `docs/credits.md`: `namedrop/avatar.jpg`, `flashlight/corridor.jpg`, `polaroid/photo-*.jpg`, `polaroid/table.jpg` and `bubblewrap/walnut.jpg` (Lorenz), `dandelion/dandelion-atlas.jpg`, `hourglass/hourglass-atlas.jpg`, `dispersion/cat-atlas.png`, `lavalamp/lava-lamp.jpg`, `cracks/palms.jpg`, `cracks/swing.jpg`, `ferrofluid/marble.jpg`.

Original to the project: `icon.png`, `splash-icon.png`, `adaptive-icon.png`, `favicon.png` (present from the initial commit, please confirm you made them), and the other `catalog/*.jpg` thumbnails, which are screenshots of this app.

## In the repository but not shipped

Nothing requires these, so Metro leaves them out: `charizard.png` (a scan of a Pokémon card, owned by Nintendo, Creatures and GAME FREAK). Delete `charizard.png` from the public repository regardless.
