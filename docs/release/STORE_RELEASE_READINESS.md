# Community Connect Australia — store release readiness

Status date: 27 August 2026  
Candidate version: 1.0.0  
Android application ID: `info.siza.communityevents.app`  
iOS bundle ID: `info.siza.communityevents`

## Automated gates now enforced

- Store name is Community Connect Australia; in-app module titles remain Community Events Australia and Community Businesses Australia.
- Android compile and target SDK are pinned to API 36 for the Google Play requirement effective 31 August 2026.
- Production EAS builds set `APP_RELEASE_MODE=production`; internal builds retain tester safeguards.
- iOS production and simulator builds are pinned to EAS `macos-sequoia-15.6-xcode-26.0`, which meets Apple's iOS 26 SDK upload requirement effective 28 April 2026. HaishinKit 1.9.3 is compiled per-file with normal Release optimisation because its whole-module build triggers an Xcode 26 Swift compiler crash; the workaround is isolated to that pod and must be re-evaluated when the livestream SDK is upgraded.
- iPhone version 1 is intentionally not advertised as iPad-compatible until tablet QA is completed.
- Store icon is an opaque 1024×1024 PNG. The in-app logo remains unchanged.
- Android and iOS Firebase application files and stable package identifiers are checked.
- Expo Doctor's generic app-config/native-sync warning is intentionally disabled because Android is checked in for native streaming support. The release check separately enforces every mirrored Android release value.
- `npm run check` parses the application source; `npm run check:release` validates release configuration.

## Mandatory manual gates before public submission

1. Finish the outstanding real-device checklist in `PWA_PARITY_CHECKLIST.md` and `REVIEW_COMMENTS.md` on the S22 and at least one current iPhone.
2. Publish legally reviewed consolidated Privacy Policy and Terms covering both Events and Business Directory at the existing production URLs. Confirm the operator's legal name, business name/ABN disclosure, contact details, effective date and retention periods.
3. Keep the Account Deletion page public and confirm the in-app deletion callable removes the Firebase Authentication account plus associated personal data as stated.
4. Purge fictional/test Events, Businesses, Promotions, messages, notifications, uploads and crash data before production, while retaining only approved demo data needed by store reviewers.
5. Complete Apple App Privacy and Google Play Data safety declarations, including Firebase, Crashlytics, Google Maps/Places, notifications, phone authentication, location, calendar, camera, microphone, image uploads, messaging and YouTube streaming.
6. Create store screenshots from the final production candidate. Required scenes: login/guest choice, Events home, event drawer, map marker popup, prayer/Hijri view, Business Directory, business page, Promotions and profile/account deletion.
7. Provide reviewers a working Australian test phone flow or a fully featured review/demo path, and keep all backend services available during review.
8. Confirm support email monitoring and public support/account-deletion URLs.
9. Run a closed Android test and iOS TestFlight test before production release.

## iOS signing hand-off

A signed iPhone `.ipa` and App Store/TestFlight upload require the company Apple Developer Program team. An organisation Account Holder/Admin, or an App Manager with Certificates, Identifiers & Profiles access, must either:

- sign in once when EAS requests Apple authentication and let EAS create the certificate/profile; or
- upload the company's existing distribution certificate and provisioning profile to the shared Expo project.

Required Apple values after the company app record is created:

- Apple Developer Team ID
- App Store Connect app numeric ID
- App Store SKU chosen by the company
- authorised Apple account role

Do not sign the production app with a personal team and later attempt to replace it. The first store record and signing setup should belong to the company team that will publish and maintain the app.

## Build commands

Preflight:

```powershell
npm.cmd run check
npm.cmd run check:release
npx.cmd expo-doctor
```

iOS simulator artifact (not installable on a physical iPhone and not uploadable to the App Store):

```powershell
npx.cmd --yes eas-cli@latest build --platform ios --profile ios-simulator
```

Signed iOS App Store/TestFlight build after company credentials are available:

```powershell
npx.cmd --yes eas-cli@latest build --platform ios --profile production
```

Android Play Store AAB:

```powershell
npx.cmd --yes eas-cli@latest build --platform android --profile production
```

## Current external requirements checked

- Apple App Review Guidelines and account deletion: https://developer.apple.com/app-store/review/guidelines/
- Apple iOS 26 SDK upload requirement: https://developer.apple.com/news/?id=ueeok6yw
- Apple App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Google Play API level requirement: https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Expo build infrastructure: https://docs.expo.dev/build-reference/infrastructure/
- Expo Apple roles and permissions: https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/
