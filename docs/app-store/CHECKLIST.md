# Submission checklist

In order. Everything here needs the owner. Steps 1 to 5 stop a submission today.

## Before anything else

1. Decide the fixes in `review-risks.md`. Items 1 to 8 are likely rejections. Keep or rework each effect, then apply the changes.
2. Replace or clear every blocker in `asset-audit.md`.
3. Merge `main` into the release branch (Expo 58, React Native 0.88) set `disableFFmpeg` and `barcodeScannerEnabled` as decided in `review-risks.md`, and run `yarn example prebuild:clean`. A clean prebuild also clears the stale absolute `hermesc` path in the Pods config, which made a Release build crash at launch here with "Wrong bytecode version". Keep `example/metro-get-modules-polyfill.js` through the merge: Expo 58 has the same dev-only `getModules`, and without the polyfill the Release app stays on a blank screen. Recent Xcode needs the UIScene change that `main` already has, and this branch only works today through hand patches in the git-ignored `example/ios` folder. Then retest all effects on a real iPhone, since react-native-webgpu jumps from 0.5 to 0.17 and react-native-audio-api from 0.12 to 0.13. Check after prebuild that `app.json` produced the same Info.plist and privacy manifest values. Also confirm the root `splash` key still works on Expo 58.
4. Merge to `main`, so that `docs/privacy-policy.md` and `docs/credits.md` are live at their GitHub URLs. Open both links in a private window. To use a proper domain or GitHub Pages instead, update the URL in `AboutScreen.tsx` and in `metadata.md`.
5. On the About screen, point "Open-Source Licenses" at `docs/credits.md`. It currently links `LICENSE`, which does not carry the photo credits the CC licences require.

## Confirm

6. Confirm publishing kustrablazej@gmail.com in the privacy policy and the review notes, or swap in a dedicated address.
7. Have someone qualified read the privacy policy and the licence notes. They are written from the code, and they are not legal advice.
8. Confirm the bundle ID `com.blazejkustra.rneffects` and the display name "Effects". The bundle ID cannot change after the first upload.
9. Check the app icon. The 1024 px source is a capture of the Ferrofluid effect with no alpha channel and no text. Confirm it in the generated AppIcon set after prebuild.

## Apple Developer account

10. Check that the Apple Developer Program membership for team 9S2Q77K6U6 is active and that the Paid Apps and Free Apps agreements are accepted. For an individual account, your legal name appears as the seller.
11. EU only: complete the Digital Services Act trader status in App Store Connect, or the app will not be listed in the EU. Trader status publishes your address and phone number, so decide before release.
12. Register the App ID in Certificates, Identifiers & Profiles, or let Xcode do it. This Mac only has an Apple Development identity and a Developer ID one. An Apple Distribution certificate is required. Xcode creates it during Archive with automatic signing.

## App Store Connect

13. Create the app record with the values in `metadata.md`.
14. Fill in Pricing and Availability (free, regions), the App Privacy answers, the age rating answers and the review notes.
15. Set Content Rights to "contains third-party content" with rights to use it. Answer only after step 2.

## Screenshots

16. Capture on a real iPhone or simulator, with no dev tooling or status overlays, at 6.9-inch (1320 x 2868) or the size App Store Connect currently asks for. Use up to ten images.
17. Show interactive, original effects: Dandelion, Ferrofluid, Lava Lamp, Hourglass, Bubble Wrap. Leave out anything with another company's look, plus Beer. An app preview video is optional.

## Build and upload

18. In `app.json`, keep `version` 1.0.0 and `ios.buildNumber` 1. Raise `buildNumber` for each upload, and raise `version` after each release.
19. After prebuild, confirm `AppDelegate.swift` has no hardcoded Metro host and that `example/ios/RNEffects/Info.plist` keeps the expected keys.
20. Run `xcodebuild -version` and confirm a release Xcode, since App Store Connect refuses beta builds. In Xcode: open `example/ios/RNEffects.xcworkspace`, select Any iOS Device, choose Product > Archive, then Validate App, then Distribute App to App Store Connect. Fix anything validation reports.
21. Debug builds hide Release-only failures in this app, so never rely on them. Install from TestFlight on a real iPhone and run all effects. Check the first launch, each permission refused, airplane mode, and the About links.
22. Select the build, then Add for Review, and submit. Choose manual release if you want control of the launch date.
