# Community Connect Australia — final launch checklist

Status date: 9 September 2026

Release candidate: `2.0.0`

This is a native replacement for the existing store-distributed PWA wrapper. It must be submitted as an update to the existing records, not as a new app.

## Identities that must not change

| Platform | Existing production identity | Required account/signing source |
| --- | --- | --- |
| Android | `info.siza.communityevents.app` | Existing Google Play app in the Deployers account and its existing upload key / Play App Signing setup |
| iOS | `info.siza.communityevents` | Existing App Store Connect record in the Deployers account, its Apple Developer Team, distribution certificate and App Store provisioning profile |
| Firebase | Project `community-event-8b639` | Checked-in production `google-services.json` and `GoogleService-Info.plist` |

Do not use `info.siza.communityconnect.personaltest`, App Store app `6807323350`, the personal test certificate/profile or an App Check debug token for either final build.

## Code gates completed

- Production mode disables tester-only behaviour and selects production App Check.
- Legal, support, account-deletion and user-guide links use `https://siza.info`.
- The native Android package matches the existing Google Play listing.
- The production iOS bundle and both Firebase files are checked by `npm run check:release`.
- The iOS App Attest production entitlement is declared.
- Store version is `2.0.0`; checked-in Android build baseline is `63`.
- Source checks and targeted regression tests cover event-card actions, transferred ownership, recurring-series editing, pickers, approvals and streaming lifecycle.
- `react-native-maps` is pinned to the device-tested `1.27.2`; Expo Doctor is told not to replace it with an older SDK recommendation immediately before launch.

## Before creating final builds

1. In Google Play Console, note the highest uploaded version code and confirm the final AAB will be higher than it. EAS currently has a checked-in baseline of `63`, but the generated AAB is authoritative.
2. In App Store Connect, note the current marketing version, highest build number and numeric app ID for bundle `info.siza.communityevents`. Version `2.0.0` must be higher than the live wrapper version; the new build number must also be higher.
3. Confirm the Deployers Apple team has App Attest enabled on `info.siza.communityevents`. Regenerate/fetch the App Store provisioning profile after enabling it and confirm the profile contains `com.apple.developer.devicecheck.appattest-environment`.
4. Confirm the final Android builder uses the existing Play upload keystore. For local Gradle release builds, provide `ANDROID_RELEASE_STORE_FILE`, `ANDROID_RELEASE_STORE_PASSWORD`, `ANDROID_RELEASE_KEY_ALIAS` and `ANDROID_RELEASE_KEY_PASSWORD` through environment variables or uncommitted Gradle properties. Never generate a replacement upload key during the build unless Google Play's formal upload-key reset process has been completed.
5. Confirm the production EAS environment contains `GOOGLE_MAPS_API_KEY`. Do not add the value to Git.
6. Keep Firebase App Check APIs in **Monitoring** for launch. Enforce only after Play-installed and App Store/TestFlight production builds show verified traffic and legitimate requests are stable.
7. Run:

   ```powershell
   npm.cmd ci
   npm.cmd run check
   npm.cmd run test:regressions
   npm.cmd run check:release
   npx.cmd expo-doctor
   ```

### Codemagic signed Android APK

The `android-signed-release-apk` workflow in `codemagic.yaml` builds
`android/app/build/outputs/apk/release/app-release.apk` with the checked-in
production package and release signing configuration. It does not use the
debug keystore. In Codemagic, create a protected, encrypted variable group
named `android_release` and add these variables:

| Variable | Value |
| --- | --- |
| `ANDROID_RELEASE_KEYSTORE_BASE64` | Base64 of the existing Google Play upload `.jks`/`.keystore` file |
| `ANDROID_RELEASE_STORE_PASSWORD` | Keystore password |
| `ANDROID_RELEASE_KEY_ALIAS` | Existing upload-key alias |
| `ANDROID_RELEASE_KEY_PASSWORD` | Existing upload-key password |
| `GOOGLE_MAPS_API_KEY` | Production Google Maps key |

In **Codemagic > Teams > Environment variables**, create the group, mark each
value secure, restrict the group to the repository/team as appropriate, and
enable it for the workflow. On Windows, create the base64 value without
committing the keystore with
`[Convert]::ToBase64String([IO.File]::ReadAllBytes('upload-key.jks'))`.
The workflow decodes it only in the ephemeral build directory, validates it
with `keytool`, and fails before Gradle if any required value is missing or
invalid. Do not paste the keystore, passwords, or Maps key into
`codemagic.yaml`.

## Final build commands

Run these from the repository root while signed into the Expo/Apple/Google credentials belonging to the Deployers production setup:

```powershell
npx.cmd --yes eas-cli@latest build --platform android --profile production
npx.cmd --yes eas-cli@latest build --platform ios --profile production
```

The production profile deliberately has no personal-test bundle override and no App Check debug token. If EAS offers to create a new iOS distribution identity or Android keystore, stop and confirm that the existing Deployers credentials have first been selected/imported.

## Inspect the generated artifacts before upload

- AAB application ID is `info.siza.communityevents.app`, version name is `2.0.0`, and version code is above the current Play artifact.
- IPA bundle ID is `info.siza.communityevents`, short version is `2.0.0`, build number is above the current App Store build, and the signing Team ID is the Deployers team.
- IPA entitlements include production App Attest and the required notification/background modes.
- Neither artifact displays the tester banner or personal-test app name.
- Install one store-signed candidate and smoke-test sign-in, guest access, map, Share, Reminder, Contact Host, add/edit event, recurring-series edit and one notification delivery.

## Store and backend launch work

- Update Apple App Privacy and Google Play Data safety for phone authentication, account/profile data, event and business submissions, Firebase/Crashlytics, push notifications, location/maps, calendar, camera, microphone, images, messaging and YouTube streaming.
- Use the live SIZA.info URLs for Privacy Policy, Terms of Use, Support, Account Deletion and User Guide.
- Upload final screenshots and release notes for the native `2.0.0` update.
- Remove unauthorised test data and keep only approved reviewer/demo records.
- Confirm `support@siza.info` is monitored and backend production services remain available throughout review.
- Submit to closed/internal review first, then promote the exact approved artifact to production. Do not rebuild between approval and promotion.

## Test evidence accepted for this launch decision

- Functional changes were confirmed on a real iPhone.
- Android and iOS guest flows passed AWS Device Farm.
- Firebase Test Lab exercised multiple Android/API combinations; remaining Robo failures were script text-entry timing failures rather than captured application crashes.
- Targeted automated regression checks pass in the repository.

This evidence supports proceeding to final store-signed candidates. The short post-build smoke test above remains mandatory because signing, App Check attestation and store installation paths cannot be proven by the earlier personal/internal artifacts.
