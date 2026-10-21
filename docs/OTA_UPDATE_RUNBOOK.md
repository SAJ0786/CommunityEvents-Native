# Community Connect native OTA updates

## Current release restriction — 22 October 2026

The user reports the iOS store update is approved, while the Android update is still under review. They authorised sending the current fixes without a separate device testing stage, for iOS only. Do not publish an Android OTA for these changes until the user confirms Android approval or explicitly changes this restriction.

## Android catch-up register — pending publication

User instruction, 22 October 2026: retain the iOS OTA history and deliver the same changes to Android. This records the pending work; it does not lift the existing Android review hold. Every row below is published on iOS and **not yet published to Android**.

| iOS OTA group | Changes to include on Android | Android status |
| --- | --- | --- |
| `13547882-0e6d-4bee-8bb1-6e67ca321329` | Community Connect Australia share footer; administrator transfer of registration-event ownership | Pending — review hold |
| `89826346-b867-4a74-9308-78b81a99b0ed` | Transfer action inside the opened registration card; member autocomplete by name, phone and email | Pending — review hold |
| `d39e0f50-26cd-47e5-b51d-31d42368138c` | Name and phone displayed first; fresh server member lookup; formatting-tolerant matching; loading/error handling | Pending — review hold |
| `be7fd4e3-de2c-42f0-92d8-15fc593cb48c` | One shared picker for normal and registration-only event transfers, consistent eligible-member filtering and selection controls | Pending — review hold |
| `e51214b3-004c-4938-8ce3-3cb767f9e0ea` | Shared read-only registration form for saved registrations and organiser responses, preserving submitted questions, participant groups and consent | Pending — review hold |

The native source is shared by both platforms. These changes are cumulative: publish one Android update from a reviewed source containing all five rows, rather than replaying the superseded iOS updates. Latest cumulative code baseline: `0784de41753bc9e2a1f12aed581f22f5e161feba`; later documentation-only commits do not alter app behaviour. Preserve later authorised fixes when choosing the final source.

Android delivery checklist:

- [ ] User confirms Android store approval or explicitly lifts the hold.
- [ ] Confirm the intended installed Android binary and production channel. Recorded baseline is 2.1.1 (110), runtime `1ac7a2d1933a73b82d980e77f72cf46088efa61e`; verify it still matches before publication.
- [ ] Review the final source and applicable checks; export with the production environment for Android. A changed native runtime requires a new binary, not a forced OTA.
- [ ] Publish with an explicit Android-only platform target; do not republish iOS as part of catch-up.
- [ ] Record the Android update/group ID, runtime, source commit, publication time and previous Android rollback target; mark all covered rows delivered only after successful publication.
- [ ] Record device confirmation separately if received; server publication alone does not establish installation on a phone.

iOS production OTA published on 22 October 2026 (Australia/Sydney): group `13547882-0e6d-4bee-8bb1-6e67ca321329`, update `01a1608c-bf09-7c4e-bae1-16614b4fd31c`, source `0244486efaa5087d4bcc8448c3158430ee0af3ea`, runtime `b1f045e738e61629962eb354595e34e2c39b75e6` (matches iOS 2.1.1 build 16). Fixes share-footer branding and adds administrator registration-event ownership transfer. Only iOS was included; no Android OTA or new native binary was published. No on-device receipt/application is claimed. The user can open online, allow download, fully close and reopen to apply.

## Follow-up iOS OTA — native card action and member autocomplete

On 22 October 2026 (Australia/Sydney), published iOS-only production group `89826346-b867-4a74-9308-78b81a99b0ed`, update `01a1609d-70ab-79a5-9cfd-2d63df88532e`, source `3cf1299e2ad718b63c409b7efeddcca30985f449`. Runtime remains `b1f045e738e61629962eb354595e34e2c39b75e6`, matching build 16. This supersedes the earlier iOS update for matching installations. Android OTA remains on hold.

The first update exposed transfer beneath the native dashboard list card but did not wire the existing Transfer action inside opened registration details. The follow-up connects that action using fresh server permission and revision, closes details into the selected card's transfer panel, and places the selector beside that card. getRegistrationEvent was deployed to expose the server capability in both lightweight and full detail responses. No actual event ownership was changed during verification.

Transfer member lookup uses one name/phone/email autocomplete field, with matching records shown below to select. Australian 04/+61 formatting is normalised. Web normal-event and registration-event transfer dropdowns were replaced with a shared picker showing up to eight suggestions; native normal/registration transfer search uses the same matching helper. Web commit `71188c3b127f4b0bb2ea39b7b6a7c616fef3af7d` deployed to Hosting and live assets were verified. Checks passed: 120 native registration/backend cases, 145-file binding gate, admin layout, 307 web cases and production build. New mounted tests cover opened-card transfer, current revision and formatted-phone selection. Physical-device receipt/application is not claimed.

## Follow-up iOS OTA — name and phone member results

On 22 October 2026 (Australia/Sydney), published iOS-only production group `d39e0f50-26cd-47e5-b51d-31d42368138c`, update `01a160b3-c77a-7f49-8760-c3dd0095f7a9`, source `26f6167a07d64c4fd9fd938cc27e306b421fdf9c`. Runtime `b1f045e738e61629962eb354595e34e2c39b75e6` matches iOS 2.1.1 build 16. Android remains on hold; web is unchanged because the user confirmed its search results are good.

Normal-event and registration-event transfer suggestions now show the member's name with phone beneath it; email is the contact fallback and remains searchable. Every transfer opening requests current Firestore server data instead of reusing the dashboard's previous list. Suggestions are withheld while refreshing or after a failed refresh, with a retry explanation instead of misleading no-match results. Name matching tolerates repeated whitespace and Australian phone formatting remains supported. Existing city, active-account and ownership restrictions are retained.

A read-only production audit confirmed Syed Asim Raza has an active phone-only member profile with no exclusion flags. The previous registration transfer label omitted phone; normal transfer reused previously loaded users. These findings explain presentation and freshness weaknesses, but the exact device-side cause of the previously missing candidate was not directly observed. Automated checks cover phone-only partial-name/phone selection, phone-first labels, email matching, withholding stale results and server-only reads without offline cache fallback. The 121-case registration/backend suite passed before adding the server-read test; the three affected focused tests then passed, as did the 145-file binding check and admin layout check. Hermes export and EAS publication succeeded. No event ownership was changed during verification, and physical-device application is not claimed. The initial sandbox export failed on temporary-file permissions before publication; the authorised retry succeeded.

## Follow-up iOS OTA — one shared transfer picker

On 22 October 2026 (Australia/Sydney), published iOS-only production group `be7fd4e3-de2c-42f0-92d8-15fc593cb48c`, update `01a160bd-266b-7e7f-af46-dc8497bdacf5`, source `47af2bf5c419e6ff206d82842dfd8c088843b074`. Runtime `b1f045e738e61629962eb354595e34e2c39b75e6` still matches build 16. No Android update was published and web is unchanged.

The previous fix shared only search helpers, leaving separate candidate filters and layouts. Both native normal and registration-only events now render `TransferMemberPicker`, receiving the same dashboard member source and city scope. It owns matching, active/non-migrated member filtering, name/phone presentation, dropdown styling, selected state presentation, loading/error handling, and select-then-transfer controls. Each event excludes its current organiser. The registration-specific confirmation and revisioned server operation remain intact. The normal picker previously admitted inactive or migrated profiles that registration transfer would reject; the shared filter now consistently excludes them.

A fresh read-only ownership audit established that Syed Asim Raza is already the current organiser of the live approved Idara - Soz o Salam - Auditions event, explaining his exclusion for that event. No ownership was changed during this audit or verification. Checks: all 123 registration/backend tests passed, including mounted shared-picker behaviour, current-owner/inactive/migrated exclusions, phone labels, selection before submit, current revision, stale result withholding and server refresh. The 146-file binding gate and admin layout checks passed. Hermes export and EAS publication succeeded; device receipt/application is not claimed. Previous production group `d39e0f50-26cd-47e5-b51d-31d42368138c` remains the prior update record.

## Follow-up iOS OTA and web release — read-only submitted forms

On 22 October 2026 (Australia/Sydney), published iOS-only production group `e51214b3-004c-4938-8ce3-3cb767f9e0ea`, update `01a160ca-a07a-7dab-bbbd-0513f49b948e`, source `0784de41753bc9e2a1f12aed581f22f5e161feba`. Runtime `b1f045e738e61629962eb354595e34e2c39b75e6` matches build 16. Android OTA remains on hold. Web source `bf2260b3fd3755917aa8715ae185a87ab1a52978` was deployed to Firebase Hosting; live index, registration route and shared registration assets were hash-verified on communityconnect.siza.com.au.

Viewing organiser responses or a member's saved registration now reuses the editing form's grouped fields in read-only mode. Booking details, each participant, agreement text and recorded consent use the submitted field/answer snapshot, preserving historical questions and avoiding double expansion of participant fields. Edit remains based on the current published form and still resets consent for review. Read-only text fields cannot be edited; choices, dropdowns and switches cannot be changed. There is no submit action within the saved-answer viewer. Existing separate edit/delete permissions remain unchanged. Deleted answers render a deletion notice instead of an empty replacement form. Active registrations and unavailable-event history use the same saved-field layout.

Checks passed: 124 native registration/backend cases, the 146-file binding gate and admin layout; 307 web unit cases, 26 mounted web registration workflows and production build. Tests explicitly exercise preserved submitted consent, non-duplicated participant fields, blocked changes and read-only response presentation. Hermes export and EAS publication succeeded. No physical-device application is claimed. Prior iOS group: `be7fd4e3-de2c-42f0-92d8-15fc593cb48c`.

## Configuration

Expo SDK 54 uses expo-updates ~29.0.20. EAS project b05d73eb-a069-4503-be44-ceb149f4a4fe serves updates over HTTPS. Store production builds use the production channel; preview, registration-testflight and play-internal profiles use preview. Channels are separate and do not change the store identity.

Runtime compatibility uses Expo fingerprint policy. Android retains its native project and reads the generated fingerprint through expo_runtime_version=file:fingerprint. iOS is generated by EAS from app config. Native dependency, permissions or native-code changes produce a different runtime and require replacement binaries. Compatible JavaScript and asset fixes retain the existing runtime.

Updates check at launch with zero launch wait. The embedded bundle remains available offline. Downloaded updates normally apply on a later launch; no forced reload is added during a registration, form edit or live stream. Expo recovery/anti-bricking defaults remain enabled.

Production EAS environment includes the Maps key and the same release/App Check/registration feature flags as production builds. Use that environment when exporting preview updates too, so QA tests the production configuration. Never print environment values or copy keys into Git.

## Verification before publishing

1. Check the approved native origin/main and preserve unrelated files.
2. Run release/source checks and applicable regressions. Run `npx eas-cli@latest env:exec production "npm run test:ota" --non-interactive` to check native configuration and verify that a JavaScript-only edit preserves runtime while a temporary native edit changes it. The test restores original source bytes in finally blocks.
3. Review native/runtime changes. If the fingerprint differs from installed binaries, create a new build instead of trying to force an OTA update onto an incompatible runtime.
4. Publish only when explicitly requested. Start with the preview channel: `npx eas-cli@latest update --channel preview --environment production --message "Describe the fix"`.
5. Test on an OTA-enabled preview binary with the matching native runtime. Close/reopen to download, then close/reopen again to apply. Confirm the update ID/channel/runtime in EAS, cold launch, offline fallback and affected features. Testing configuration and release exports alone does not prove on-device OTA application.
6. Promote the tested update group to production only with the user's release instruction. Record group IDs, source commit, runtimes, tests and rollback target. Use staged rollout where appropriate and monitor errors. Use EAS Update rollback/republish controls if necessary.

Existing installed binaries without expo-updates cannot receive OTA updates. Users must first install the new OTA-enabled store build. Store upload/review/release and OTA publication are separate actions; building does not publish an OTA or submit to stores.

## First enablement validation

Configuration tests, real fingerprint JavaScript/native-change probes, source/release checks, existing regressions, production-environment Hermes exports and inspection of final signed packages are required. No production OTA update is published as part of initial enablement. Device testing is still required before public distribution.

References: https://docs.expo.dev/eas-update/getting-started/ ; https://docs.expo.dev/bare/installing-updates/ ; https://docs.expo.dev/eas-update/runtime-versions/
