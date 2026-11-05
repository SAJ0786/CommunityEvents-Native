# Android image and release optimisation review

Community Connect Australia • 5 November 2026 • Reported Play release 2.1.1 (110)

## Release decision

Source improvements are implemented and a signed, production-equivalent Android validation bundle passed. No store submission, OTA publication, version-number change, data migration or Firebase deployment is included. Google Play's recommendations must remain open until a newly approved production build has been evaluated by Google. The new native image module requires a new Android binary; this change cannot be delivered to build 110 by OTA.

## Findings: confirmed evidence versus hypotheses

### Image loading

The original event, directory, business detail, promotion, administration and upload-preview components used React Native Image. On Android React Native already uses Fresco, an image library; the evidence does **not** establish that the app's ordinary network images used a custom hand-written downloader/decoder. No BitmapFactory/decodeStream/decodeFile calls were found in app-owned Android sources or config plugins. The exact Play finding/stack attribution was not supplied, so attributing it to a particular SDK remains a hypothesis.

Confirmed opportunities:

- Public network image rendering had no explicit common application-level disk/memory policy.
- Registration posters are returned by authenticated callables as Base64. EventCard, RegistrationEventDetails and series review create data URIs. Those strings and their transport overhead remain in JavaScript memory while the screen needs them; they must not become a persistent private poster cache.
- Organisation logos also use the existing embedded Base64 format. Upload Base64 for registration posters and organisation logos is part of the current interface/storage design, and was preserved.
- Ordinary event and business uploads use Firebase putFile with local URIs, rather than converting every network image to Base64. Sharing an ordinary event poster downloads the original only on explicit share; this is an intentional file-sharing path, not the list renderer. Audio download and spreadsheet Base64 processing are unrelated to bitmap rendering.
- The ordinary Events Home list used FlatList defaults. My Events already had small render batches and a limited window. The directory's main results mapped every business into a ScrollView, mounting all result images.
- No app-owned Image.prefetch loop was found. Existing URL-only poster resolution cached indefinitely by event identity, did not coalesce concurrent requests and could reuse an old path's URL.
- No suitable separate thumbnail URL contract was found for event/business listing images. Existing URLs and Firebase schemas were preserved. The implementation reduces decoded display size; it does not claim to reduce the original file's first-download byte count.

### R8

R8 and resource shrinking were already enabled in both the checked-in Gradle properties and Expo build-properties configuration, including the source for build 110. The release uses proguard-android-optimize.txt. No application-level dontoptimize/dontobfuscate/dontshrink or fullMode=false setting was present.

The actual released EAS build f846c41f-0b96-402d-9081-12386eeb28af was downloaded and inspected. Its AAB includes BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map. The mapping header identifies R8 8.11.18, and renamed/removed classes are present. Thus, “R8 was disabled in build 110” is contradicted by the artifact. Whether Play is recommending finer optimisation of retained library code remains unconfirmed without the exact finding and a production re-evaluation.

AGP is 8.11.0. The newer optimised-resource-shrinking pipeline requires AGP 8.12 or later; it was not enabled through an unsupported property or an unrelated AGP/Expo/React Native upgrade. Existing resource shrinking remains enabled.

The two app-owned keep rules were retained:

1. Expo's Field annotation, needed for reflective SDK 54 Record option decoding (previously affected audio/document picker options).
2. Expo notification classes, compensating for the installed notification package's missing consumer-rule registration and protecting parcelled scheduled-trigger models.

These rules are not proven redundant. Dependency-provided React Native, Hermes, Expo, Firebase and Glide rules remain intact. No broad new keep rule or global R8 disable flag was added.

## Changes implemented

| Files | Change and reason |
| --- | --- |
| src/components/OptimizedImage.android.js | Android-only expo-image renderer, backed by Glide. Uses a short per-view source-generation key to clear recycled content without sending the Base64 string twice. |
| src/components/OptimizedImage.js | Retains React Native Image on iOS/web; consumes the Android-only fullscreen flag. |
| src/utils/imageRenderPolicy.js | Public HTTP(S) source disk caching, no additional decoded-memory cache; no disk/memory cache for Base64, local previews or header-authenticated sources; size-aware ARGB decoding; existing cover/contain semantics. |
| src/components/EventCard.js, EventDetailsModal.js | Use the image boundary for cards/details; explicit original-resolution decode for fullscreen poster readers. Registration poster authorisation/lifecycle rules stay in their existing code. |
| src/components/AdminDashboardScreen.js, CreateEventForm.js, EventPosterPicker.js, RegistrationEventDetails.js, RegistrationPrototypeScreen.js, StreamedVideosScreen.js | Apply the Android pipeline to organisation logos, admin community-image previews, event previews, private posters and video thumbnails. |
| src/business/BusinessApprovalPanel.js, BusinessCard.js, BusinessDetailsScreen.js, BusinessDirectoryModule.js, BusinessListingForm.js, BusinessOwnerScreen.js, BusinessPromotionApprovalPanel.js, BusinessPromotionForm.js | Apply the same policy to directory/business/promotion/admin images and upload previews; retain existing fallback/error presentation. BusinessCard clears an old failure when its image URL changes. |
| src/registration/RegistrationEditor.js, SeriesApproval.js | Use the image boundary for private poster preview/review; retain callable transport and privacy checks. |
| App.js | Android Events Home: first batch 4, maximum batch 4, window 5; retain iOS defaults. |
| src/business/BusinessDirectoryModule.js | Android main result rows now use FlatList (initial/batch 6, window 5). iOS keeps its ScrollView. Existing search/category/city/loading/error/empty/select behaviour is preserved. Featured cards in the header remain eager; they are a remaining consideration if that section grows very large. |
| src/services/images.js | Coalesce concurrent public poster URL lookups, use the storage path as identity, cap the URL-only LRU at 128 and allow failed requests to retry. Private registration payloads are not cached here. |
| package.json, package-lock.json | Add only expo-image ~3.0.11, selected by Expo SDK 54's compatibility catalogue; add the focused test command. Expo/React Native versions remain unchanged. |
| android/app/build.gradle | Explicit release Crashlytics mapping upload after plugin application. Existing R8/resource shrinking and native integration rules retained. |
| eas.json | Retain release mapping outputs as EAS artifacts; add a production-equivalent performance-audit AAB profile with autoIncrement=false and no submission. |
| scripts/test-android-images.cjs | Exercise cache privacy, source recycling, fullscreen fidelity, unchanged iOS renderer, request coalescing/eviction/retry, 1,000 directory records with lazy Android rows, and release configuration. |
| scripts/test-registration-integration.cjs | Mock the shared image boundary in existing mounted registration/privacy tests; load the real pure Hijri date helper introduced by the prior OTA. |
| scripts/measure-android-performance.ps1 | Read-only adb memory/frame sampling for reproducible baseline/optimised device measurements. It does not clear user data, log out or send notifications. |

Existing source images, aspect ratios, styles, fallback logos and access controls were retained. No public thumbnail endpoint or private image file cache was introduced. Native Glide cleans up view requests on destruction/recycling; there is no custom background prefetch work to cancel.

## Tests and limits

Completed checks:

- Nine new Android image/list/build-policy tests passed, including a 1,000-business fixture and unchanged iOS rendering path.
- 57 mounted registration integration tests passed, including registered-only poster access, account switching and unavailable-event poster handling.
- 83 backend registration/notification-matrix cases passed, using mocks with no live participant writes or message delivery.
- Member registration/auth/profile suite, existing UI/navigation/notification/streaming/email regression suite, business-hours suite and Hijri date regression passed.
- Source/UI binding check parsed 150 application JavaScript files; release and OTA configuration checks passed; git diff --check passed.
- The first release validation build (9126edda-c31c-4269-9470-ac770d80e2ea) failed during Gradle configuration because the new Crashlytics build-type setting ran before its plugin was applied. The configuration was moved after plugin application, with an ordering regression check, and a replacement build was requested. It was not an image compile failure. No broken build was distributed.

No local phone or emulator was available. For the guest device check, Firebase Test Lab supplied a physical Samsung Galaxy A10 (Android 10/API 29, 32-bit ARM, 2 GB model). Test Lab reports 1,766,368 KiB of usable device RAM and a 131,072 KiB app heap cap. The same five-minute guest script and crawl, locale en_AU and portrait orientation were requested for both builds. No live phone OTP login, real notification delivery, actual image upload or end-to-end Crashlytics crash was triggered. Firebase denied the read needed to verify the saved test number, so no automated sign-in or live SMS request was made. Automated auth/notification/navigation checks do not replace those device acceptance checks. No iOS native build was run.

## Measurements

Actual downloaded release 110 and candidate AAB, with decimal size units:

| Metric | Play build 110 | Validation bundle | Change |
| --- | ---: | ---: | ---: |
| AAB archive | 71,456,486 bytes (71.46 MB) | 74,198,062 bytes (74.20 MB) | +2,741,576 (+3.84%) |
| Estimated Galaxy A10 APK download | 21,041,359 bytes | 21,639,971 bytes | +598,612 (+2.85%) |
| DEX files | 2 | 2 | 0 |
| Total DEX | 12,361,088 bytes (12.36 MB) | 12,652,040 bytes (12.65 MB) | +290,952 (+2.35%) |
| Summed DEX method IDs | 79,048 | 81,391 | +2,343 |
| Class definitions | 12,894 | 13,177 | +283 |
| R8 mapping (uncompressed) | 112,348,478 bytes | 114,357,602 bytes | +2,009,124 |

Observed Galaxy A10 Test Lab guest runs:

| Metric | Play build 110 | Validation bundle |
| --- | ---: | ---: |
| Test outcome | Success | Success |
| Mean sampled total memory | 267.52 MiB | 131.49 MiB |
| Peak sampled total memory | 438.39 MiB | 175.11 MiB |
| Nonzero memory samples | 598 | 289 |
| Initial display | 1.177 s | 1.277 s |
| Recorded action trace duration | 295.4 s | 136.4 s |
| Successful action steps | 57 | 29 |

Method-ID totals include references repeated across DEX files; they are not a count of globally unique methods. Both A10 estimates use bundletool 1.18.3, API 29, armeabi-v7a/armeabi, density 280 and en-AU splits. They are estimates, not measured Play delivery or installed sizes. AAB size includes assets for all target architectures and the obfuscation mapping; the mapping is not installed on the user's device. The candidate includes new image decoder native libraries and a different application source revision, so the raw delta should not be attributed solely to the image library.

The two Test Lab runs used the same model, OS, locale, guest script and five-minute limit. Their automatic crawls took different paths and ended at different times. The baseline Home screenshot was still loading, while the candidate Home screenshot showed 143 Sydney events and a rendered card image. The memory figures describe the separate runs; they do not isolate the image renderer or establish a controlled percentage improvement. No per-image decode timing, cache hit rate or comparable frame-time series was available.

The focused test issued 20 concurrent resolutions for one storage path and observed one underlying getDownloadURL call. This is measured request coalescing under a mock, not a network benchmark. The 1,000-row fixture verifies lazy row construction and configured batches, not resident memory on a phone.

## Remaining risks and acceptance steps

1. Follow the guest smoke runs with a controlled same-device test. Use the same account, city/data and actions for baseline and optimised measurements. Run the sampling script for cold/warm event scrolling, repeated navigation, business images, full posters and upload previews. Record peak/mean PSS and frame timings, and visually confirm fallback/error states and full poster text.
2. Verify phone login, push/deep links, scheduled notifications and Crashlytics delivery from the minified binary. Do not trigger a real production crash or send messages to users during automated inspection.
3. Private registration poster Base64 transport remains a memory cost. A future authenticated thumbnail/ephemeral-file design requires a separate security review; persistent private disk caching is intentionally absent here.
4. First downloads still use original image URLs. Server-produced thumbnails would require a separately approved storage/API design. The image library adds native code, so smaller AAB/DEX totals are not guaranteed.
5. The Android image dependency changes native runtime fingerprints. Do not publish this source as OTA to old binaries. Future compatible builds must be prepared before OTA publication; iOS still selects React Native rendering but any future iOS binary needs its own native dependency/build validation.
6. Store submission requires an approved new Android version code. This audit deliberately keeps 2.1.1/110 and does not submit the validation artifact. Google Play must evaluate a later submitted production build before either warning can be marked resolved.

## Primary references

- [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/): native pipelines, cache policy, downscaling and content fitting. The installed 3.0.11 source/type definitions were checked because the SDK 54 documentation URL redirected to current documentation.
- [Android R8 optimisation](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization): release shrinking, optimise defaults, full-mode behaviour and AGP 8.12 requirement for the newer resource pipeline.
- [Crashlytics deobfuscation](https://firebase.google.com/docs/crashlytics/android/get-deobfuscated-reports): mapping files and Gradle mapping upload.
- [Firebase Test Lab results](https://firebase.google.com/docs/test-lab/android/analyzing-results) and [Samsung Galaxy A10 specifications](https://www.samsung.com/ie/business/smartphones/galaxy-a/galaxy-a10-sm-a105fzkubtu/): device test scope and model memory.

## Final build outcome

- [EAS signed validation build](https://expo.dev/accounts/siza-apps/projects/community-events-australia-native/builds/ebacb151-6a0c-40f4-b56b-6fe97e0c8ff1) completed on 5 November 2026, source 73f26712608522c399eff7188724b52c0e9fa2b5, build profile performance-audit. Manifest version code 110 and app version 2.1.1 were verified. Bundletool validation and JAR signature verification passed. AAB SHA-256: `40563d6c7342e0126a1d00d4793de0f66bdde3257b4f0981f511fd3ce79dbae2`.
- EAS logs show minifyReleaseWithR8 and uploadCrashlyticsMappingFileRelease. Both ExpoImageModule and Glide are present in the candidate mapping. The standalone EAS archive contains matching mapping.txt (SHA-256 matches the AAB's embedded mapping), configuration.txt, resources.txt, seeds.txt and usage.txt. Its effective configuration contains no global disable directives. A resource shrinking report was retained. Mapping upload task success is not proof of a new crash appearing in the dashboard.
- [Baseline guest Test Lab result](https://console.firebase.google.com/project/community-event-8b639/testlab/histories/bh.5e9e43fc16cd8dd6/matrices/8004726606668940665) and [candidate guest Test Lab result](https://console.firebase.google.com/project/community-event-8b639/testlab/histories/bh.5e9e43fc16cd8dd6/matrices/5109657790093042567): both succeeded on the Galaxy A10. Inspected Home captures confirm both reached Events Home and the candidate rendered a listing image. This does not certify all private posters, directory images, upload flows, signed-in navigation, push/deep links or device-side crash reporting.
