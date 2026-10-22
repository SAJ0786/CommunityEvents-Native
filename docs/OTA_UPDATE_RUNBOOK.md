# Community Connect native OTA updates

## Current platform release status — 22 October 2026

The user confirmed Android approval on 22 October 2026, lifting the earlier Android review hold. Google Play was independently checked: production release 2.1.1 (110) is completed. The previously authorised Android catch-up OTA has now been published. iOS remains on its existing latest update. Earlier history sections describe the release status at that time; their Android hold statements are superseded by this current status.

## Android catch-up register — published

User instruction, 22 October 2026: retain the iOS OTA history and deliver the same changes to Android after approval. Every row below is now included in cumulative Android production group `b03ff983-d196-4c38-8a21-3498978e9cee`. Published means available from Expo for matching installations, not confirmed installed on every phone.

| iOS OTA group | Changes to include on Android | Android status |
| --- | --- | --- |
| `13547882-0e6d-4bee-8bb1-6e67ca321329` | Community Connect Australia share footer; administrator transfer of registration-event ownership | Published — 22 Oct 2026 |
| `89826346-b867-4a74-9308-78b81a99b0ed` | Transfer action inside the opened registration card; member autocomplete by name, phone and email | Published — 22 Oct 2026 |
| `d39e0f50-26cd-47e5-b51d-31d42368138c` | Name and phone displayed first; fresh server member lookup; formatting-tolerant matching; loading/error handling | Published — 22 Oct 2026 |
| `be7fd4e3-de2c-42f0-92d8-15fc593cb48c` | One shared picker for normal and registration-only event transfers, consistent eligible-member filtering and selection controls | Published — 22 Oct 2026 |
| `e51214b3-004c-4938-8ce3-3cb767f9e0ea` | Shared read-only registration form for saved registrations and organiser responses, preserving submitted questions, participant groups and consent | Published — 22 Oct 2026 |
| `cd596126-111f-4bea-8558-e2732d4a90b2` | Business Management ownership transfer using shared member search, explicit confirmation and audited server transaction | Published — 22 Oct 2026 |
| `7a1bfdd9-613f-4f91-822c-b90541ed6e35` | Correct transfer eligibility for active accounts whose migration marker points to their own UID, including Iram Rizvi and Sajjad Zaheer | Published — 22 Oct 2026 |

The native source is shared by both platforms. One cumulative Android update delivered all recorded rows; the superseded iOS groups were not replayed. Cumulative code baseline: `1e05d752143205c15ba211e3a8ef7a72085faea3`. Published source `28a7e96b7d70f5c76c3e5b2bfd80325785d1b01f` includes the same code plus documentation-only history changes.

Android delivery checklist:

- [x] User confirmed Android store approval; Google Play production 2.1.1 (110) independently verified as completed.
- [x] EAS build `f846c41f-0b96-402d-9081-12386eeb28af` is finished, production channel, runtime/fingerprint `1ac7a2d1933a73b82d980e77f72cf46088efa61e`.
- [x] OTA configuration check passed; current production-environment runtime matched build 110 before publication; Android Hermes export succeeded. Current code retains the previously passed 131 native/backend cases and UI checks; no application code changed for catch-up.
- [x] Published using explicit Android-only platform target. iOS was not republished.
- [x] Android update/group/runtime/source/time/rollback target recorded below, and all seven covered rows marked published.
- [ ] Optional device confirmation: not yet received. Server manifest delivery is verified; installation/application on an individual phone is not claimed.

## Android cumulative production release — 22 October 2026

- Group: `b03ff983-d196-4c38-8a21-3498978e9cee`.
- Update: `01a16241-fd0d-7082-9a0e-eea6c3d0c4f8`.
- Published: 22 October 2026 (Australia/Sydney); EAS timestamp `2026-10-22T06:17:34.221Z`.
- Platform/channel: Android only, production branch/channel.
- Runtime: `1ac7a2d1933a73b82d980e77f72cf46088efa61e`, matching approved 2.1.1 build 110.
- Source: `28a7e96b7d70f5c76c3e5b2bfd80325785d1b01f`.
- Previous Android target: build 110's embedded bundle. The production branch contained only the seven iOS update groups before this publication; there was no previous Android OTA group. Use an Android-specific rollback-to-embedded operation if needed, not an iOS group.

The live Expo production endpoint was checked with Android runtime/platform headers and served the new Android update ID. A separate iOS request still served `01a1620a-eca3-7c29-9a9a-410d0c538989`, proving the iOS production update remained unchanged. No store binary, ownership operation, backend or web deployment was performed for this catch-up. Users on older binaries must first install Play Store 2.1.1 (110); compatible installations download OTA at launch and normally apply it on a subsequent launch.

## Earlier iOS release history

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

## Follow-up iOS OTA and web release — business ownership transfer

On 22 October 2026 (Australia/Sydney), published iOS-only production group `cd596126-111f-4bea-8558-e2732d4a90b2`, update `01a161d0-591b-7c31-9e93-4dc26906499f`, source `515332218946a665a3c2eafacd84d28483815019`. Runtime `b1f045e738e61629962eb354595e34e2c39b75e6` matches build 16. Android remains on hold, with this sixth release added to the catch-up register. Web source `445461c163b8bf0857f35479e30b58bc271d0654` was deployed to Hosting; live index and MemberDirectory assets were hash-verified.

Business Directory → Admin Dashboard → Business Management now offers Transfer ownership for non-historical listings. It reuses the existing platform member picker with name/phone/email search and explicit transfer confirmation. The server validates active admin and target profiles, city scope for city admins, expected current owner and non-historical listing status. Superadmins can transfer across city scope. Archived/deleted listings require restoration first; the current owner and inactive/migrated accounts are excluded from suggestions.

The new `transferBusinessOwnership` callable atomically updates the listing, linked promotions, new-enquiry routing and a `businessAudit` ownership-transfer record. Original owner provenance and submission metadata are retained. Listing approval, visibility, public content, categories, ABN and promotion statuses are preserved. All linked promotion records move together, including historical promotion records. Existing private conversation participants are not changed or exposed to the new owner; new enquiries route to the current listing owner. Transfers exceeding 400 linked promotions fail before any writes rather than partially moving ownership. No additional transfer email/push campaign was introduced.

Deployed only the new callable and updated `sendBusinessEnquiry` in the business-workflow codebase. Enquiries read listing/contact ownership inside their transaction and prefer authoritative listing ownership, repairing a stale route an older approval client might leave. This prevents an enquiry from restoring a pre-transfer contact target. Live endpoints were verified to reject unauthenticated requests; no real business ownership was changed during verification.

Checks passed: 128 native registration/business/backend cases; business history, approval, notification/enquiry routing, binding and admin layout checks; 308 web unit cases, two mounted business-transfer UI cases and production build. Tests cover atomic linked-record updates, preserved public content/history, role/city/active-account guards, stale and same-owner failures, oversized transactions, member autocomplete, explicit confirmation and new-owner enquiry routing. The final routing priority adjustment was rechecked by the affected workflow suite. Hermes export and iOS publication succeeded. Physical-device application is not claimed. Previous iOS group: `e51214b3-004c-4938-8ce3-3cb767f9e0ea`.

## Follow-up iOS OTA and web release — self-referencing migration eligibility

On 22 October 2026 (Australia/Sydney), published iOS-only production group `7a1bfdd9-613f-4f91-822c-b90541ed6e35`, update `01a1620a-eca3-7c29-9a9a-410d0c538989`, source `1e05d752143205c15ba211e3a8ef7a72085faea3`. Runtime `b1f045e738e61629962eb354595e34e2c39b75e6` matches build 16. Android remains on hold; this seventh release is recorded for catch-up. Web source `a6e305ce840efa92c4dcf8dbd1e8d3e446c808aa` was deployed and live index and all migration-related JavaScript assets were hash-verified.

A read-only audit found that Iram Rizvi and Sajjad Zaheer are active Sydney Super Admins with existing `migratedToUid` values equal to their own document UIDs. The strict transfer filter introduced earlier incorrectly classified these as accounts migrated away. Native normal-event/registration-event/business pickers and web transfer eligibility now allow an active self-reference while still rejecting a different migration destination. Registration and business transfer server checks were updated too; the business check also permits such an active admin to initiate transfers. Normal active/inactive, banned, deleted, city-scope, current-owner and stale revision/owner checks remain in force. The web event/business transfer filters share one eligibility helper. No account document, role or actual ownership was changed during this fix.

Search criteria: at least two characters; case-insensitive partial match against full name, display name, name or email; phone matching supports phone/phoneNumber/mobile/mobileNumber with Australian 04/+61 normalisation. Up to eight suggestions are shown. Super Admin status does not exclude a target. The current owner is excluded from native transfer pickers and web registration/business transfer pickers because choosing them is not a transfer. City admins remain limited to their scope, while Super Admin operators can search across cities.

Deployed only `transferBusinessOwnership` and `transferRegistrationEventOwnership` for the server correction. Checks passed: 131 native/backend cases, 146-file binding gate, admin layout, 309 web unit cases, mounted business-transfer/eligibility cases and production web build. Regression tests explicitly cover both named profile shapes, active self-referencing Super Admin actors/targets, and continued rejection of real migrations and inactive/current-owner targets. The actual audited flags were also evaluated against the corrected web/native eligibility functions. Hermes export and iOS publication succeeded; device receipt/application is not claimed. Previous iOS group: `cd596126-111f-4bea-8558-e2732d4a90b2`.

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
