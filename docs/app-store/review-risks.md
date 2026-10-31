# App Review risk audit

Ranked by likelihood of rejection or legal complaint, based on the code on 2026-10-30 and the App Review Guidelines current on that date. Likelihood is judgement: App Review varies by reviewer. No effect has been removed or renamed. Every item below is an owner decision unless it says "Applied".

Rules cited most: 1.1.6 (false features), 1.4.3 (alcohol), 2.5.4 (background modes), 4.1 (copycats), 4.2 and 4.3 (minimum functionality, spam), 5.1.1 (privacy), 5.2.1 (third-party IP), 5.2.5 (Apple products).

The biggest overall pattern: the app's most striking screens are faithful replicas of Apple, Telegram and Instagram interfaces, with those names on them. A reviewer who opens the catalog sees those names first. The smallest change that removes most of the risk is a rename and restyle pass across the top section below.

## High: likely rejection

### 1. Wallet (Apple Pay sheet replica)
Evidence: `WalletPayScreen.tsx` reproduces the double-click-to-pay flow with "Double Click to Pay", "Pay with Face ID", "Hold Near Reader", a stack of cards, and `VISA` text marks. `CardArt.tsx` draws overlapping red and yellow discs in the Mastercard mark, with a chip and contactless symbol.
Guidelines: 5.2.5 (confusingly similar to an Apple interface), 5.2.1 (Apple Pay, Visa and Mastercard marks), 1.1.6 (a payment interface that performs no payment).
Fix: drop every system phrase and the side-button prompt ("Tap to reveal your card"), replace VISA and the discs with an invented mark, and use the app's own sheet design with rounded corners and colours that differ from Wallet. Keep the card glint shader, which is the real effect.

### 2. Real iOS home screens (NameDrop, Siri Orb)
Evidence: `namedrop/home-atlas.jpg` and `iphone-background.png` are screenshots of iOS with Apple's icons for Maps, Photos, Wallet, Safari, Messages and others, plus Apple's wallpaper.
Guidelines: 5.2.1, 5.2.5. Also an asset blocker.
Fix: rebuild both from invented icons on a CC0 wallpaper.

### 3. Telegram Dissolve and Telegram Spoiler
Evidence: full chat replicas built from glyphs cropped from Telegram, Telegram's own wallpaper, and "Telegram" in the catalog titles. Copy mentions "t.me/title", "Up to 200,000 members" and the group creation banner naming Blazej Kustra.
Guidelines: 4.1(a) and (c), 5.2.1.
Fix: rename to "Message Dissolve" and "Hidden Text", redraw the icons, replace the wallpaper, and use an invented chat style. The particle work carries the effect on its own.

### 4. Voice Delete (Instagram DM)
Evidence: Instagram DM layout and glyphs cropped from the app, and "Instagram DM" in the catalog description.
Guidelines: 4.1, 5.2.1.
Fix: remove the name, redraw the icons, restyle the chat. Bundle the four picsum.photos images too, since the screen currently depends on the network and on photos with no recorded source, and it breaks offline during review.

### 5. iMessage Effects
Evidence: "iMessage Effects" title, a Messages-style chat, the FaceTime SF Symbol, and blue and grey bubbles.
Guidelines: 5.2.5 names Messages as an example of an app you may not look like.
Fix: rename "Screen Effects" or "Send Effects", change the bubble colours and remove the FaceTime button.

### 6. NameDrop
Evidence: Apple's feature name as the title, "Bring two iPhones together and swap contacts" as the description, and "Share" and "Receive Only" as in iOS, ending in "Contacts exchanged". Nothing is exchanged.
Guidelines: 5.2.5, 5.2.1, 1.1.6.
Fix: call it "Wave Reveal" or similar, describe it as an animation, and remove the "exchanged" outcome.

### 7. Cracked Screen and Crackgate (fake lock screen, broken-device prank)
Evidence: `LockScreen.tsx` draws a live iOS lock screen with SF Symbols, and a fake notification reads "Did you drop your phone again?". Crackgate names "the iPhone Duo hinge crack, white pixels and all" and adds dead-pixel failures.
Guidelines: 1.1.6 ("trick/joke functionality... inaccurate device data", and it states that "for entertainment purposes" does not help), 5.2.5, 5.2.1. Crackgate also mocks a named Apple product defect, which invites more scrutiny than a generic effect.
Fix: keep the app's chrome visible, or show a persistent small caption, so nobody can read it as their real phone. Replace the lock screen with an abstract scene (a photo with an invented clock style). Rename Crackgate to "Hinge Crack" and remove "iPhone Duo". Applied: the review note states that the effect is contained in the app.

### 8. Thanos
Evidence: Marvel character name as a title. The redesigned thumbnail is an app screenshot and the film still is gone.
Guidelines: 5.2.1.
Fix: rename to "Snap" or "Dust".

## Medium: real chance of rejection or complaint

### 9. Weather App
Evidence: catalog description "Apple Weather UI clone", and the layout follows Apple Weather.
Guidelines: 5.2.5, 1.1.6 (static sample forecast can read as real data).
Fix: rewrite the description to "Skies that change with the weather", state that the data is sample data, and shift the layout. Identify or replace the icons.

### 10. Siri Orb, AI Orb description, Banners
Evidence: "Siri Orb" title, "Gemini-style" in the AI Orb description, and "Duolingo · Don't lose your streak" as a default in `StreakFire.tsx`, which also imitates iOS notifications.
Guidelines: 5.2.1, 4.1(c), 2.3.7 for metadata.
Fix: "Glow Orb", "Morphing thinking blob", and an invented app name in the banner.

### 11. Cards
Evidence: `HoloCardScreen.tsx` prints REVOLUT and MONZO on cards, with full card-style details.
Guidelines: 5.2.1.
Fix: invented bank names, sample numbers that look obviously fake.

### 12. Trademarked titles
- **Polaroid:** a registered mark and a recognisable product design, with the rainbow stripe on the camera. Rename "Instant Camera". The permission string already avoids the name (Applied).
- **Magic 8-ball:** Mattel's mark, and the visual is the same object. Rename "Mystic Ball" and change the number. Fortune-telling is also listed in 4.3(b) as a saturated category, though as one effect of many it should pass.
- **Sauron Eye:** Middle-earth Enterprises enforces this actively. Rename "The Eye".

### 13. Name and 4.2 / 4.3 positioning
Evidence: the catalog feels like a developer showcase. Entries such as "Foam lab" ("Eight foam treatments side by side, pick one"), "Linear Gradient", "Circular Gradient" and "Scroll Reactive" read as a component-library demo. 4.2 asks for lasting entertainment value, and 4.3(b) names flashlight, sound effect and wallpaper apps as saturated.
Fix: hide Foam lab and the plain gradient screens from the store build (Foam lab is a developer tool that also ships an unlicensed photo). Lead with the toy-like effects, and describe the app as an interactive toy, as `metadata.md` does. The new catalog helps here. A reviewer may still consider it a tech demo, and the honest argument is depth: more than forty original real-time interactive shaders.

### 14. App name
"React Native Effects": React Native is Meta's project name and mark, and 5.2.1 and 4.1(c) apply to third-party product names in an app name. A search of the US store on 2026-10-30 found "Expo & React Native components" by an unrelated developer, so such names do pass, but that gives no permission. I could not find a published Meta policy on this, so treat it as unresolved. No exact collision with "Effects" turned up. Recommended: keep "Effects" as already configured. The owner can also rebrand for a consumer audience, since "RN" means nothing to non-developers.

## Age-rating items: fine if declared

### 15. Lighter
Evidence: a realistic lighter with a flame the user strikes and tilts.
Guideline: a neutral physics toy with no brand and no sale should pass, and the rating question must be answered honestly.
Fix: keep the copy neutral.

### 16. Beer
Evidence: phone as a full glass, "rotate to drink".
Guidelines: 1.4.3 (excessive alcohol) and 4.3(b), which calls drinking games low-value. iBeer-style apps have shipped for years, and a brand-free visual with no drinking game should pass.
Fix: leave it out of screenshots. The foam photo is an asset blocker.

### 17. Scratch-off (Clover Cash)
Evidence: a fake $5 ticket, "$500" prizes and "You won $500". No money is involved, so 5.3 does not apply. It counts as simulated gambling in the rating questionnaire, and Apple lists that as R 18+ for Australia even at Infrequent, plus a possible 18+ tier elsewhere at Frequent. Also 1.1.6 if a prize reads as real.
Fix: replace dollar amounts and the ticket price with points or symbols ("You found three clovers"). The simulated gambling answer can then become None. This is the cheapest way to keep the wider rating.

## Low

### 18. Inside-joke copy and real names
Evidence: "Expo Go is enough for prod, right?", "Expo Enjoyers", "pod install is fixing it as we speak", and real first names (Kacper, Mateusz, plus Blazej Kustra in a banner). Reviewers will shrug at the jokes, but ordinary users will not understand them. Get consent from anyone named, or use invented names. The copy was written on purpose for developers, so keep it if that stays the audience.

### 19. Device frames and system-styled fonts
Apple allows device frames in marketing within its guidelines, but avoid iPhone renders in the app's own UI. Text in screenshots must follow 2.3.7, and no iPhone names should appear in the subtitle.

### 20. Flashlight
"The Dynamic Island torch" is an on-screen effect and leaves the real torch off. 1.1.6 could apply if the screen implies it controls the LED. 4.3(b) lists flashlight apps as saturated, which is harmless for one effect in a larger app. Rewrite as "A beam from the top of your screen".

### 21. Permissions on entry
Dandelion and Birthday Candle ask for the microphone as soon as they open. Apple accepts this when the purpose is clear, and refusing must leave the app usable. Verified on a simulator: after refusal both screens stay usable and show "Microphone permission denied".

## Status on 2026-10-31

The owner asked to release, so the fixes below are applied. Where an item above names an effect by its old title, this table gives the new one.

| Item | Status | What changed |
| --- | --- | --- |
| 1 Wallet | Fixed | Now "Metal Card": a single tap, no payment flow or system phrases, invented mark, app-styled sheet, no card stack. The glint shader is unchanged |
| 2 Home screens | Fixed | No app-icon grid remains. Glow Orb sits on a CC0 misty path photo and Wave Reveal carries that scene to a dusk photo |
| 3 Telegram screens | Fixed | Now "Message Dissolve" and "Hidden Text", with redrawn icons, an original wallpaper and an invented chat style |
| 4 Voice Delete | Fixed | Restyled, redrawn icons, four bundled images, no network |
| 5 iMessage Effects | Fixed | Now "Send Effects", with teal bubbles, a flat top bar and no call button |
| 6 NameDrop | Fixed | Now "Wave Reveal", an animation from a misty morning scene to a dusk photo. No contact poster, no real person, no share choice |
| 7 Cracked Screen, Crackgate | Fixed | Abstract scene with an invented clock and a persistent caption. Crackgate is now "Hinge Crack" and the product name is gone |
| 8 Thanos | Fixed | Now "Dust" |
| 9 Weather | Fixed | New copy, labelled "Sample forecast", left-aligned layout, solid range bars, redrawn icons |
| 10 Orbs, Banners | Fixed | "Glow Orb", "Morphing thinking blob", invented app name in the banner, new Banners line |
| 11 Cards | Fixed | Invented issuers, obviously fake numbers, contactless mark removed |
| 12 Trademarked titles | Fixed | "Instant Camera" with a neutral stripe, "Mystic Ball" with a 7, "The Eye" with new copy |
| 13 Positioning | Fixed in the catalog | Beer Foam (Foam lab), Linear Gradient, Circular Gradient and Scroll Reactive removed. A reviewer may still call the app a tech demo |
| 14 App name | Open | Unchanged: "Effects" |
| 15, 16 Lighter, Beer | Open | Age rating answers, and keep Beer out of screenshots |
| 17 Scratch-off | Fixed | Now "Lucky Clover" in the UI, with points and symbols and no ticket price. The simulated gambling answer can be None |
| 18 Jokes and names | Fixed | Invented people, everyday chat scripts, developer in-jokes removed |
| 19 Device frames | Open | Nothing changed. Applies to marketing images |
| 20 Flashlight | Fixed | New copy. The SF Symbol PNGs are deleted and the screen uses plain sliders and a switch |
| 21 Permissions | No change needed | Already verified |

## Fixed in the repository (Applied)

| Risk | Change |
| --- | --- |
| 2.5.4 background modes | `UIBackgroundModes: audio` came from the audio plugin default and has no feature behind it. Now disabled |
| 5.1.1 vague purpose strings | Microphone, camera and motion strings are now specific. The motion string was still the template text |
| ITMS-91053 privacy manifest | ExpoFileSystem's own manifest is missing from the built app (its bundle is empty), and its binary uses disk space and file timestamp APIs. Reasons are now declared in the app manifest through `app.json` |
| Release launch failure | Bundle Mode needs `require.getModules`, which Expo defines only in dev builds, so every Release build was a blank screen. Added `example/metro-get-modules-polyfill.js`, wired in `metro.config.js` |
| Dev hooks | Every `__*` window hook was already behind `__DEV__`, and a search of the Release Hermes bundle confirms none ship. No edit needed |
| Dev console | Removed a stray render `console.log` from `ScrollReactiveScreen.tsx` |
| Launch screen | Expo 58 ignores the root `splash` key, which left a launch storyboard pointing at a missing image. The black background and splash image now come from the `expo-splash-screen` plugin |
| iPad | iPhone only, since nothing is designed for iPad. Reviewers may still run it in compatibility mode on an iPad |

## Other decisions

- **Portrait lock:** `app.json` now sets portrait, since tilt effects would otherwise rotate the layout mid-gesture. Hinge Crack replays on a tap. Rotating no longer replays it.
- **FFmpeg:** `"disableFFmpeg": true` is set on the react-native-audio-api plugin. The Release build on 2026-10-31 has no FFmpeg frameworks.
- **Barcode scanning:** `"barcodeScannerEnabled": false` is set on expo-camera. See `docs/credits.md`.
