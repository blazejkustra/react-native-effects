# Submission checklist

In order. Steps marked Done are finished. The rest need the owner, and steps 1 to 4 stop a submission today.

## Before anything else

1. Decide the fixes in `review-risks.md`. Items 1 to 8 are likely rejections. Keep or rework each effect, then apply the changes.
2. Replace or clear every blocker in `asset-audit.md`.
3. Decide `disableFFmpeg` and `barcodeScannerEnabled` as described in `review-risks.md`. Both are still unset. Either change needs `yarn example prebuild:clean`, a pod install and a new archive. Done on `feat/catalog-redesign`: `main` is merged (Expo 58, React Native 0.88.1, react-native-webgpu 0.17, react-native-audio-api 0.13), the polyfill stays, and all iOS config lives in `app.json`.
4. Merge to `main`, so that `docs/privacy-policy.md` and `docs/credits.md` are live at their GitHub URLs. Both return 404 today, so the About links fail until the merge. Open both links in a private window. To use a proper domain or GitHub Pages instead, update the URL in `AboutScreen.tsx` and in `metadata.md`.
5. Done: the About screen links `docs/credits.md`.

## Confirm

6. Confirm publishing kustrablazej@gmail.com in the privacy policy and the review notes, or swap in a dedicated address.
7. Have someone qualified read the privacy policy and the licence notes. They are written from the code, and they are not legal advice.
8. Confirm the bundle ID `com.blazejkustra.rneffects` and the display name "Effects". The bundle ID cannot change after the first upload.
9. Check the app icon. The generated AppIcon set holds the 1024 px Ferrofluid capture with no alpha channel. Confirm you like it on a real home screen.

## Apple Developer account

10. Check that the Apple Developer Program membership for team 9S2Q77K6U6 is active and that the Paid Apps and Free Apps agreements are accepted. For an individual account, your legal name appears as the seller.
11. EU only: complete the Digital Services Act trader status in App Store Connect, or the app will not be listed in the EU. Trader status publishes your address and phone number, so decide before release.
12. Done: automatic signing registered the App ID and created an App Store profile that expires on 2027-10-30. Signing uses a cloud-managed Apple Distribution certificate, so the Mac keychain has no local Distribution identity. Exports need a working Xcode account session.

## App Store Connect

13. Create the app record with the values in `metadata.md`.
14. Fill in Pricing and Availability (free, regions), the App Privacy answers, the age rating answers and the review notes.
15. Set Content Rights to "contains third-party content" with rights to use it. Answer only after step 2.

## Screenshots

16. Capture on a real iPhone or simulator, with no dev tooling or status overlays, at 6.9-inch (1320 x 2868) or the size App Store Connect currently asks for. Use up to ten images.
17. Show interactive, original effects: Dandelion, Ferrofluid, Lava Lamp, Hourglass, Bubble Wrap. Leave out anything with another company's look, plus Beer. An app preview video is optional.

## Build and upload

18. In `app.json`, keep `version` 1.0.0 and `ios.buildNumber` 1. Raise `buildNumber` for each upload, and raise `version` after each release.
19. Done: the generated project is `example/ios/Effects`, `AppDelegate.swift` has no hardcoded Metro host, and `HERMES_CLI_PATH` resolves inside the worktree. The built bundle is Hermes bytecode 99. The IPA has the expected Info.plist keys, iPhone only, no background modes, and the dark interface style.
20. A signed App Store build exists at `example/ios/build/export/Effects.ipa`, from `example/ios/build/Effects.xcarchive` (Xcode 27.2, build 27B52, iOS 27.2 SDK). It has not been validated by Apple: this Mac has no altool credentials, and step 13 has to come first. Open the archive in Xcode Organizer, run Validate App, then Distribute App to App Store Connect. The `ios/build` folder is git-ignored, and `prebuild --clean` deletes it, so archive again after any clean prebuild.
21. Debug builds hide Release-only failures in this app, so never rely on them. Every route passed in a Release build on an iOS 26.5 simulator, including microphone, camera and motion refusal. Still to do on a real iPhone: first launch, all effects, real microphone, camera and sensors, Liquid Glass in the top bar, airplane mode, and the About links after step 4. A development-signed copy of the archive is installed on the iPhone 16.
22. Select the build, then Add for Review, and submit. Choose manual release if you want control of the launch date.
