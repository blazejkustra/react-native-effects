# App Store metadata

Paste these into App Store Connect. Limits are noted where Apple enforces them. Items marked DECISION depend on the owner's choices in `review-risks.md`.

## Identity

| Field | Value |
| --- | --- |
| App name (30) | Effects |
| Subtitle (30) | Toys you tilt, blow & shake |
| Bundle ID | com.blazejkustra.rneffects |
| SKU | rneffects-ios |
| Version | 1.0.0 |
| Build | 1 |
| Primary language | English (U.S.) |
| Primary category | Entertainment |
| Price | Free, no in-app purchases |
| Devices | iPhone only |
| Copyright | 2026 Blazej Kustra |

"Effects" is the store name and matches the name under the icon. Check availability in App Store Connect before the first upload; if it is taken, use a subtitle-style fallback such as "Effects: Shader Toys". "React Native Effects" carries a trademark risk (see `review-risks.md`).

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

Effects is a pocket collection of interactive visual effects. Every one is a real-time shader running on your iPhone's GPU, and every one responds to you: touch, tilt, sound and motion.

Things to try:

- Tap hard and watch the screen glass crack where you hit it
- Blow on your phone to send dandelion seeds drifting or put out a candle
- Tilt to stir a lava lamp and slosh a full glass
- Hold a magnet near your phone and watch ferrofluid reach for it
- Shake an instant print while it develops
- Scratch foil, pop bubble wrap, flip an hourglass

There are also fabrics, liquid metal, northern lights, fire, ink and weather skies to play with, plus chat animations that turn messages to dust.

The app has no accounts, no ads and no tracking. It is built on react-native-effects, an open-source library, and the source code is on GitHub.

Sensor and microphone readings are used live for the animation and stay on your iPhone. The cracks, chats and cards are visual effects only: nothing happens to your device, and no messages or payments are sent.

## Keywords (100)

interactive,physics,particles,satisfying,fidget,toy,art,animation,visual,sensory,relaxing,simulation

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
| Alcohol, tobacco, or drug use or references | Infrequent | Beer and Lighter effects |
| Medical or treatment information | None | |
| Health or wellness topics | No | |
| Mature or suggestive themes | None | |
| Sexual content or nudity | None | |
| Cartoon or fantasy violence | None | |
| Realistic violence | None | |
| Guns or other weapons | None | |
| Gambling | No | No real money |
| Simulated gambling | None | Scratch-off uses points and symbols, with no money or wagering |
| Contests | None | |
| Loot boxes | No | |

Expected result: 13+. Apple maps Frequent alcohol or tobacco references to 18+, and two effects out of about forty supports Infrequent. Confirm the outcome on the Age Ratings page in App Store Connect.

Do not tick "Made for Kids".

## App Privacy (nutrition label)

- Do you or your third-party partners collect data from this app? **No, data not collected.**
- Tracking: **No.**
- Resulting label: **Data Not Collected.**

Why this holds: nothing the app reads leaves the device and there is no analytics, crash SDK, account or backend. Microphone and sensor data is analysed in memory, photos stay in temporary storage, and Apple defines collection as data transmitted off the device and kept beyond the real-time request.

## Export compliance

`ITSAppUsesNonExemptEncryption` is `false` in `example/app.json`, so App Store Connect will skip the encryption question.

Basis: the app contains no proprietary or non-standard encryption and only uses HTTPS through iOS. `disableFFmpeg` removes the OpenSSL code that FFmpeg would bring in. The owner is the party certifying this to Apple.

## Review notes

Paste into App Review Information > Notes. No demo account is needed.

    Effects is a catalog of interactive real-time visual effects rendered on the GPU. There is no login, no backend, no purchases, no network use and no user-generated content. No demo account is needed.

    All people, chats, cards, banners, balances and forecasts in the app are fictional sample content. Chat screens are scripted animations and send nothing. Card screens make no payments. Weather is a labelled sample forecast. Banners are invented notifications and use no calendar or weather data. AI Orb, AI Shimmer and AI Voice are visual effects and contain no AI service.

    Device features (a real iPhone is recommended, because the simulator has no motion sensors):
    - Microphone: open Dandelion or Birthday Candle and blow on the phone. AI Orb and AI Voice start on tap. Audio is analysed live and never recorded. Refusing permission leaves the screens usable.
    - Camera: open Instant Camera, press Continue, allow the camera, then press the shutter. The photo stays in temporary storage and is not saved or uploaded.
    - Motion: tilt in Beer, Hourglass or Lava Lamp. Shake in Instant Camera or Mystic Ball.
    - Magnetometer: hold a magnet near the phone in Ferrofluid, or touch and hold the screen if no magnet is available.

    Other notes:
    - Cracked Screen and Hinge Crack show a permanent caption saying they are an effect. They end when you go back.
    - Hourglass is a working focus timer.
    - Flashlight is an on-screen beam and does not use the LED.
    - Scratch-off uses symbols and always reveals a match. There is no money, stake or prize.
    - Beer is a physics toy with no brand, drinking game or challenge.
    - Links on the About screen, including the Privacy Policy, open in the system browser.
    - The app is iPhone only and runs in compatibility mode on iPad.

    Contact: kustrablazej@gmail.com
