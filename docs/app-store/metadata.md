# App Store metadata

Paste these into App Store Connect. Limits are noted where Apple enforces them. Items marked DECISION depend on the owner's choices in `review-risks.md`.

## Identity

| Field | Value |
| --- | --- |
| App name (30) | RN Effects |
| Subtitle (30) | Shaders you tilt, blow & shake |
| Bundle ID | com.blazejkustra.rneffects |
| SKU | rneffects-ios |
| Version | 1.0.0 |
| Build | 1 |
| Primary language | English (U.S.) |
| Primary category | Entertainment |
| Secondary category | Graphics & Design |
| Price | Free, no in-app purchases |
| Devices | iPhone only |
| Copyright | 2026 Blazej Kustra |

"React Native Effects" as the store name is possible but carries a trademark risk (see `review-risks.md`). "RN Effects" matches the name under the icon.

## URLs

| Field | Value |
| --- | --- |
| Privacy Policy URL | https://github.com/blazejkustra/react-native-effects/blob/main/docs/privacy-policy.md |
| Support URL | https://github.com/blazejkustra/react-native-effects/issues |
| Marketing URL (optional) | https://github.com/blazejkustra/react-native-effects |

The privacy URL resolves only after `docs/privacy-policy.md` reaches `main`. The About screen links to the same URL.

## Promotional text (170)

Dozens of live GPU effects you can touch. Crack the glass, blow out a candle, pour a drink, stir a lava lamp. Every frame renders in real time on your iPhone.

## Description (DECISION: keep every named effect in sync with the final catalog)

RN Effects is a pocket collection of interactive visual effects. Every one is a real-time shader running on your iPhone's GPU, and every one responds to you: touch, tilt, sound and motion.

Things to try:

- Tap hard and watch the screen glass crack where you hit it
- Blow on your phone to send dandelion seeds drifting or put out a candle
- Tilt to stir a lava lamp and slosh a full glass
- Hold a magnet near your phone and watch ferrofluid reach for it
- Shake an instant print while it develops
- Scratch foil, pop bubble wrap, flip an hourglass

There are also fabrics, liquid metal, northern lights, fire, ink and weather skies to play with, plus chat animations that turn messages to dust.

The app has no accounts, no ads and no tracking. It is built on react-native-effects, an open-source library, and the source code is on GitHub.

Sensor and microphone readings are used live for the animation and stay on your iPhone. The cracks, chats and payment scenes are visual effects only: nothing happens to your device, and no messages or payments are sent.

## Keywords (100)

shader,gpu,visual,interactive,physics,particles,webgpu,generative,satisfying,fidget,art,animation

Leave out every third-party name, including Apple, iPhone, Instagram, Telegram and Polaroid.

## Age rating questionnaire

Apple's current questionnaire. Answers reflect the catalog as of 2026-10-30.

| Question | Answer | Reason |
| --- | --- | --- |
| Parental controls | No | |
| Age assurance | No | |
| Unrestricted web access | No | About links open in the system browser |
| User-generated content | No | Camera prints stay on device and are never shared |
| Messaging and chat | No | Chat screens are scripted animations |
| Advertising | No | |
| Social media or social feed | No | |
| Profanity or crude humor | None | |
| Horror or fear themes | None | |
| Alcohol, tobacco, or drug use or references | Infrequent | Beer, Cigarette and Lighter effects |
| Medical or treatment information | None | |
| Health or wellness topics | No | |
| Mature or suggestive themes | None | |
| Sexual content or nudity | None | |
| Cartoon or fantasy violence | None | |
| Realistic violence | None | |
| Guns or other weapons | None | |
| Gambling | No | No real money |
| Simulated gambling | Infrequent | Scratch-off card with dollar prizes |
| Contests | None | |
| Loot boxes | No | |

Expected result: 13+. Apple maps Frequent alcohol or tobacco references to 18+, and three effects out of more than forty supports Infrequent. Apple lists Infrequent simulated gambling as R 18+ in Australia, so see the Scratch-off entry in `review-risks.md`. Confirm the outcome on the Age Ratings page in App Store Connect.

Do not tick "Made for Kids".

## App Privacy (nutrition label)

- Do you or your third-party partners collect data from this app? **No, data not collected.**
- Tracking: **No.**
- Resulting label: **Data Not Collected.**

Why this holds: nothing the app reads leaves the device and there is no analytics, crash SDK, account or backend. Microphone and sensor data is analysed in memory, photos stay in temporary storage, and Apple defines collection as data transmitted off the device and kept beyond the real-time request.

One caveat: Voice Delete fetches four images from picsum.photos, so that service sees the user's IP address. The developer never receives it, which keeps the answer accurate, and bundling those images removes the caveat altogether.

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `example/app.json`, so App Store Connect will skip the encryption question.

Basis: the app contains no proprietary or non-standard encryption and only uses HTTPS through iOS. The FFmpeg libraries inside react-native-audio-api include OpenSSL code, and the app never calls it. Setting `disableFFmpeg` removes that code entirely (see the decision in `review-risks.md`). The owner is the party certifying this to Apple.

## Review notes

Paste into App Review Information > Notes. No demo account is needed.

    RN Effects is a catalog of interactive GPU shader effects built with the open-source react-native-effects library. Each effect is an original real-time shader written for this app. There is no login, no backend, no purchases and no user-generated content.

    Everything shaped like another product is a visual demonstration running inside this app. The chat, lock screen, payment and contact screens are scripted animations with invented content: they send no messages, make no payments, and exchange no contacts. The cracked screen effects are clearly part of the app and end when you go back.

    Device features to test: a real iPhone is recommended, since the simulator has no motion sensors.
    - Microphone: open Dandelion or Birthday Candle and blow on the phone. AI Orb and AI Voice start on tap. Audio is analysed live and is never recorded.
    - Camera: open Polaroid and allow the camera, then press the shutter. The photo stays in temporary storage.
    - Motion: tilt in Beer, Hourglass or Lava Lamp. Shake in Polaroid or Magic 8-Ball.
    - Magnetometer: hold a magnet near the phone in Ferrofluid.

    Contact: kustrablazej@gmail.com
