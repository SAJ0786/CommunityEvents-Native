# Community Connect Australia — Copilot / next-agent handover

## Current Codex handover - 17 October 2026, Australia/Sydney

### Final source handoff - user owns BOTH platform builds

- Latest user direction: **"You just confirm that Native App code in Git is final.
  then I will build myself for both"**. This supersedes agent-owned binary delivery
  tasks below. Stop waiting for Apple input; do not start further signing, builds
  or submissions. User owns iOS AND Android builds/distribution from this source.
  No completed TestFlight delivery or installed-device parity is claimed.
- Final implementation source on Native `main`:
  `1efe7330a316c98f204ddcd4e7cd851d653a0b8a`; checked clean and equal to
  `origin/main` before this documentation-only handoff. Subsequent handoff commit
  changes documentation only and is the final checkout for the user's builds.
- Native source is ready for the user's tester builds within the documented
  scope: 2.1.1, dedicated `registration-testflight` / `registration-apk` profiles
  enable registration only. Default production profile still disables registration;
  do not accidentally build it expecting registration to appear. No public-store
  release authorization, new OTA architecture or notification activation implied.
- **Recurrence backend prerequisite is now LIVE**, following user's additional
  request to deploy Web and the coordinated prerequisite authorization.
  Only `functions:registration` deployed from clean
  `acae2b7974891347904156194aac2c6a6b3bbfcf` (documentation-only successor of
  implementation `1efe733`); command exit 0, no force. All 20 functions ACTIVE,
  Node 22, `australia-southeast1`; includes
  `createregistrationseries-00001-xuh`. Deployed archive matches all 16 tracked
  JS/MJS/JSON source/package files byte-for-byte. All existing secret references
  preserved; gates remain ENABLED=true / NOTICES=false / MAINTENANCE=true.
  Full env hashes match 18 of 19 old functions; save's only actual difference is
  platform-managed `FUNCTION_SIGNATURE_TYPE=http` added where previously absent.
  New save/approve/get/list revisions: `00004-zuc` / `00004-xed` /
  `00004-nok` / `00004-dug`. No real records/messages, rules/index/migration or
  other-codebase changes. Matching Web release is coordinated by its owner.
- Matching Web follow-up final source:
  `5619d40ffe4aca55efc5f9f1b60c63b5d59b9e07`, clean/pushed; Hosting deployment
  authorized and prerequisite confirmed, final Hosting evidence pending.
  Partner reports 283 root +21 React tests, 95 responsive layouts, phone/desktop
  field-order/headings/admin-tab checks and production build pass. Earlier live
  Web/runtime/backend release evidence below remains valid, not this new source.
- Known Native layout difference: shared normal-form step followed by registration
  settings, not Web's exact new single-page order/headings/admin-tab layout.
  Recurrence behavior is implemented/tested; exact Web presentation is not claimed.
- Android build 97 remains available only as a PRE-recurrence artifact; it is not
  the final source handed over now. iOS provisioning was not completed/verified.
  Preserve existing app/signing identities; user handles Apple setup locally.
- Source validation is complete (99 targeted tests, 130-file source check, release
  check, 14 regression runners and prayer timezone fixtures). Physical-device,
  store/provider acceptance and all user-owned binary delivery remain outstanding.

### New recurring-registration follow-up - source complete, backend deployed

- User added recurring registration events and explicitly chose **separate
  registration, capacity and closing date for each occurrence**. This is new
  work after the staged release/Android build 97. Backend deployment was separately
  authorized and completed as recorded above; no new Native build is inferred.
  User owns further signing/builds, not the agent.
- Additive callable `createRegistrationSeries({city,createKey,draft,recurrence,
  occurrences})` creates independent pending event/form/private documents
  atomically plus callable-private `registrationSeries/{seriesId}` retry receipt.
  Returns `{seriesId,events:[{eventId,revision:1,status:'pending'}]}`.
  Stable key retries do not duplicate or partially create events.
- Rule: `calendarType:'gregorian'|'hijri'`, `frequency:'day'|'week'|'month'|'year'`,
  integer `repeatEvery:1..100`, `endMode:'count'|'date'`, count or inclusive end.
  Fortnightly is week/every 2. Hijri cadence uses `startHijri:{day,month,year}` and
  date-end `endHijri`, with server-owned `settings/hijriCalendar.overrides`.
  True lunar recurrence is required, not Gregorian monthly/yearly spacing
  disguised by a Hijri first-date display.
- Max 100 occurrences/atomic creation (yearly max 5), nonyear within one year,
  yearly within four years; 8 MiB serialized series data bound. Every row requires
  explicit `date,capacity,closes,startTime,endTime`; row zero matches draft.
  Empty clocks/date-only and overnight semantics retained; each schedule resolves
  using authoritative city timezone and DST validation. Each prayer clock must
  be recalculated by the client; never copy the first seasonal prayer time.
- Immutable read provenance: `seriesId`, zero-based `occurrenceIndex`,
  `occurrenceCount`, `recurrenceRule`. Existing editor/save/approve/delete/book/
  cancel/stream/calendar/staged publication acts on ONE occurrence. Editing a
  member must never regenerate siblings/new series. No series-wide lifecycle
  or shared bookings/capacity is authorized or implied.
- Private posters remain separate per-event, per-revision uploads; no shared path
  or public URL. Existing quota is 10 uploads/user/hour; report failures and
  unattempted remaining posters explicitly without recreating events or bypassing
  quota. Pending/private projection, approval and notification holds remain.
- Production now has all 20 functions. This source added a twentieth
  callable and the new private receipt collection (default-denied client access).
  No rules/index/migration needed. Web owns authorized matching Hosting release;
  user owns tester binaries; older clients continue single-event flow.
  Android build 97 DOES NOT contain recurrence.
- Backend/helper validation so far: 64 targeted tests pass, including all 100
  occurrences committed, oversized forms rejected with zero writes, retry races,
  independent booking/cancellation/staged approval/privacy and true Hijri cadence.
  Forward calendar conversion matches Native across 1,680 anchored test cases;
  Gregorian/fortnightly/month clamp/leap rules match prior art across four zones.
  Native recurrence UI is implemented: one-time/recurring, calendar cadence and
  count/end controls, reviewed per-occurrence closing/capacity/clocks, seasonal
  prayer recalculation, frozen ambiguous-retry request and quota-aware per-event
  private poster failures. Edit/copy never regenerate series. Confirmation routes
  to actual My Events, not public Home where initial pending events are hidden.
- Native retains the actual shared normal event form followed by registration
  settings; it does NOT duplicate Web's newly requested exact single-page field
  order. Native existing order is title, organiser/host, date/time, private venue,
  event type/subject/audience/speakers/notes, then registration closing/capacity/
  frequency/preview/cancellation/private poster and questions. This layout
  difference is explicit, not claimed as exact-order parity.
- Final combined source verification: **99 targeted tests PASS**, including 45
  backend, 35 mounted/Native integration, 5 recurrence parity/transport, 6 schedule,
  4 stream, 3 email guard and 1 venue. Source check 130 JS files, release config
  check, all 14 regressions, prayer/Azaan timezone fixtures and diff checks pass.
  No real records, notifications or streams were produced for recurrence.
  Backend deployment completed after separate authorization; user-owned later
  tester binaries are still needed. Android97 remains the previous release.

**This section supersedes the historical continuation below, especially its old
checkout paths, undeployed-backend statements, App Check description and
immediate-approved-edit policy. Do not enable delivery or publish public-store
builds based on historical instructions.**

### Checkout, ownership and authorization

- Current Native checkout:
  `C:\Users\sajja\.copilot\repos\CommunityEvents-Native`, repository
  `SAJ0786/CommunityEvents-Native`, user-owned `main`. Fetch safely, preserve
  unrelated edits, commit intended files only with the Copilot trailer, push
  normally and verify origin equality. No new branches, PRs or force pushes.
- Web owns `SAJ0786/CommunityConnect-WebApp`; coordinate rather than editing its
  backend/Hosting from Native. Native owns the `registration` Firebase codebase
  and `events-email:sendPrivateStreamLinkEmail`. Web owns its 12 canonical default
  streaming/calendar functions; never migrate the email function's ownership.
- User authorized this registration backend and Web release, then explicitly
  selected **"Authorize 2.1.1 tester builds with registration enabled"**:
  TestFlight first, Android test APK next, existing app identities, NO public-store
  submission, no OTA architecture and no new registration email/push/reminder
  delivery. Native build and distribution status is tracked separately below.

### Production release - verified, not just source ready

- Native/backend source `1848a204b318a2f5849540060c03a22382cbc470` was deployed
  from clean main with:
  `firebase deploy --only functions:registration --project community-event-8b639 --config backend\firebase.json --non-interactive`.
  Exit 0, no force retry; all 19 functions ACTIVE, Node 22,
  `australia-southeast1`, updated 16 October 2026 19:19:19-39 UTC.
- Downloaded deployed source archive matches all 14 tracked JS/MJS/JSON source
  and package files byte-for-byte. Representative revisions:
  save `saveregistrationevent-00003-wuk`,
  approve `approveregistrationevent-00003-cot`,
  get `getregistrationevent-00003-fin`,
  list `listregistrationevents-00003-ker`,
  poster put/get/remove `00003-hil` / `00003-cuh` / `00003-kig`,
  account cleanup `cleanupregistrationaccounts-00003-bot`.
- All 19 preserve `EVENT_REGISTRATION_ENABLED=true`,
  `EVENT_REGISTRATION_NOTICES_ENABLED=false`,
  `EVENT_REGISTRATION_MAINTENANCE_ENABLED=true`. Secret references unchanged;
  callable `enforceAppCheck:false` unchanged. No rules, indexes, migrations,
  real participant writes, emails, pushes or streams were run for verification.
  Runtime env comparison resolved two metadata-hash differences: save runtime env
  unchanged; delete gained only platform-managed `FUNCTION_SIGNATURE_TYPE=http`.
- Existing owned email guard remains live from `dfe9c57`,
  `sendprivatestreamlinkemail-00014-zek`: authorized registration session calls
  return `{sent:false,reason:'registration-delivery-disabled'}`; ordinary behavior
  unchanged. This release did NOT redeploy events-email or other codebases.
- Web partner confirms live runtime source `9729f2f36757d6995a69e854a6fb45eee3c59b79`,
  Hosting version `aa458d7a89f29384`, released 16 October 2026 19:21:35 UTC,
  https://communityconnect.siza.info. All 134 hosted file hashes match; `/`,
  `/app`, `/businesses` return exact deployed artifact; signed-out 390/1440 layouts
  pass without overflow/browser errors. Thirteen empty-payload rejection probes
  pass (10 auth 401, 3 invalid-argument 400, NOT authenticated-flow acceptance).
  Web handover/docs main `0a53ed2d13481f07bfd09069cb2bb77df20c6eeb`.
  Prior Hosting `97f9f2dedf9923d5` retained on
  `registration-pre-staged-20261017`. No default function change in this follow-up.

### Current registration contract

- Normal Home cards/order, Quick Access registration-only/all toggle; no standalone
  registration navigation. Initial pending event only host My Events/admin
  management, prominent `UnApproved`; approval superAdmin only under User Management.
- Approved edits now stage privately in `registrationPendingChanges/{eventId}`.
  Published event/form/private venue/contacts/poster stay live for discovery,
  attendee and host self-registration, calendars and streaming until approval.
  Manager `getRegistrationEvent` adds `event.hasPendingChanges` and
  `pendingChanges:{event,form,privateDetails,submittedAt,submittedBy}`; top-level
  stays published for EVERY caller. Nonmanagers receive neither pending object
  nor pending flag. Review scope includes initial pending and approved+staged.
- `canApprove` is server-authorized superAdmin for initial pending OR staged
  approved event. Approval requires expected control revision, rechecks current
  capacity/city/timezone/event-day restrictions, atomically promotes editable
  content without stale counters/stream state, and increments revision on staged
  promotion. Changed form uses promotion revision; unchanged formVersion stays.
  Clients reload authoritative state after mutation, never predict revisions.
- Approved poster upload/removal stages; default poster is published;
  `getRegistrationPoster({eventId,view:'pending'})` manager-only, no fallback.
  Cleanup protects both referenced versions and retires superseded media through
  existing grace/retry machinery. Delete/account cleanup discards drafts safely;
  participant history retained. Direct pending collection access remains denied
  by default; no rules/index/migration was needed.
- Native uses actual normal `CreateEventForm` in registration mode. Public
  descriptive metadata includes host/organiser/on-behalf, audience/speaker/reciters,
  Hijri and exact `timeMode:'manual'|'prayer'` metadata. Private contacts are
  `hostPhone` and `hostContactOptional`, not public projection. No public poster
  URL; authorised callable-only private media. Full constraints:
  `backend\functions-registration\README.md` current staged section.
- Explicit city-zone start/end clocks derive UTC; date-only remains valid, no
  fabricated time/duration. Reported legacy Badminton card lacked all four saved
  clock/instant fields (Web public-only query); user must re-enter time.
- Delivery holds remain: registration notices off, private-stream email guard,
  no registration legacy live notification, Web reminder candidate unexported/
  undeployed. Promotion may queue outbox; this does NOT authorize sending it.

### Native tester delivery - do not confuse build with installation

- No compatible OTA route: no `expo-updates` dependency, update URL, runtime or EAS
  channel; checked-in Android manifest explicitly disables updates. New signed
  binaries required. Backend/Hosting/source changes do not update installed apps.
- Read-only EAS history: latest successful Android internal APK build
  `b94dd666-2d68-4e56-b75a-189d565228cb`, version 2.0.0/build 96,
  old source `ba9dc5f`; NOT this release. Recent iOS entries cancelled/errored;
  no current iOS artifact is claimed. EAS authenticated; preview/production
  environments list a Maps variable, no registration/city/promotion flags.
- Public Apple lookup 17 October confirms existing bundle
  `info.siza.communityevents` / App Store ID `6782770347` live version **2.1.0**.
  Source/package/Android marketing version raised deliberately to **2.1.1**;
  EAS remote auto-increment controls monotonic build numbers.
- Dedicated `registration-testflight` extends production identity/Xcode image,
  tester release mode, production App Check, registration enabled only;
  `registration-apk` extends existing internal APK/debug-App-Check tester profile.
  Both explicitly keep unrelated city/promotion flags false. Ordinary profiles
  stay registration-disabled. No personal-test bundle/certificate substitution,
  no new signing identity or upload key, no debug token committed.
- Tester source/config committed and pushed:
  `05686cd4065f4bb274ef4de0e0503fdde510cf30`. Build source includes the full Native
  staged-approval/form-parity implementation plus the dedicated tester profiles.
- Android build **FINISHED**, version 2.1.1/build 97, completed
  16 October 2026 19:42:53 UTC:
  https://expo.dev/accounts/siza-apps/projects/community-events-australia-native/builds/c1b96322-25ce-49ca-a2e2-0214fa78e25f
  Profile `registration-apk`, INTERNAL, exact source `05686cd`, existing remote
  keystore `community-events-production-v1`. No duplicate builds or Play upload.
  Effective config confirms registration true, city/promotion false, tester mode,
  debug App Check and internal APK. Install artifact:
  https://expo.dev/artifacts/eas/-Hrp4ReIrDwVyReXSm7TSzFg39rg4WD3TV8D4EaiFck.apk
  Downloaded artifact verified: package `info.siza.communityevents.app`,
  versionName `2.1.1`, versionCode `97`, target/compile SDK 36; APK Signature
  Scheme v2 verifies, one RSA signer, existing SIZA Apps release certificate.
  Signer SHA-256:
  `a5ba88c1a81b75a7d8b5e7824a85685235130db51ae9ba55af5719294d5e6d24`.
  APK SHA-256:
  `95c7b199301923cd5cacb14300844bfedd9a175d7d0bcba3511e9ce9e28609f3`.
  Packaged `assets/app.config` independently confirms registration true,
  city/promotion false, debug App Check and version 2.1.1. No private key/debug
  token was printed or committed. Physical installation/acceptance is NOT claimed.
  This is not a Play release or automatically installed update.
- iOS **BLOCKED BEFORE QUEUE**, not built/uploaded/processing/available to testers.
  `build --platform ios --profile registration-testflight --freeze-credentials
  --non-interactive --no-wait` failed: credentials not set up; interactive mode
  required. EAS remote iOS buildNumber advanced 1 -> 2; no build ID was created.
  Bounded interactive inventory found existing production certificate
  `DZMB985S73`, team `D36Y75H5BU`, expiry 1 September 2027. Selected ONLY
  "Distribution Certificate: Use an existing one"; no new certificate or revocation.
  EAS then requested a matching provisioning profile and Apple Developer login
  (`Apple ID` prompt). No authentication or profile creation completed.
- User/authorized Apple owner must finish local Apple login/2FA or supply the
  existing matching App Store provisioning profile. Never paste credentials into
  chat/Git. Visible terminal "Native iOS existing signing inspection" is available.
  Restart from this checkout if needed:

      Set-Location 'C:\Users\sajja\.copilot\repos\CommunityEvents-Native'
      $env:EXPO_NO_DOTENV='1'
      npx.cmd --yes eas-cli@latest credentials --platform ios

  Select `registration-testflight`, existing bundle `info.siza.communityevents`,
  team `D36Y75H5BU`, certificate `DZMB985S73`; preserve production App Attest/APNs.
  Do not select the personal-test app, generate/revoke a certificate or replace
  Android keys. After valid provisioning is attached, retry the frozen iOS build.
  On success inspect its identity/entitlements and upload that exact build ID:
  `npx.cmd --yes eas-cli@latest submit --platform ios --profile production --id <verified-ios-build-id> --non-interactive`.
  iOS submission here is TestFlight upload ONLY, never App Store review/public
  release. Verify upload, Apple processing and tester availability separately.

### Verification and outstanding Codex tasks

- Revalidated deployed source: 79 targeted tests PASS (40 backend, 25 Native
  integration, 6 schedule, 4 stream, 3 email guard, 1 venue), 129 JS source files
  parse. Tester release revalidation also passes 35 client/schedule/stream tests,
  all 14 regressions, source check and updated 2.1.1 release check. Resolved EAS
  TestFlight config confirms version 2.1.1, production bundle/App Check,
  registration true, unrelated gates false, tester mode and remote auto-increment.
  Prior complete source checkpoint also passed prayer timezone fixtures.
- Web reports 277 Node +18 React +95 responsive layouts and production build pass.
- [x] Deploy staged registration backend and matching Web; verify metadata/source,
  gates, protected-callable rejection and live Hosting artifacts.
- [x] Build and distribute Android 2.1.1 test APK build 97; inspect actual package,
  version, gates and signing. Available artifact is not physical-device acceptance.
- [ ] USER-OWNED: complete signed iOS 2.1.1 TestFlight build/upload after local Apple
  authentication/provisioning above. Inspect artifact/version/gates/signing;
  distinguish build success/upload/processing/tester availability from installation.
- [ ] USER-OWNED: build final recurring-registration Android test APK; build 97 is
  the earlier source and does not contain recurrence.
- [ ] Physical iPhone/Android acceptance: host builder/save/reopen, staged approval
  and private poster/venue isolation, attendee edit/cancel/form re-consent,
  superAdmin approval shortcut, time/prayer/Hijri roundtrip, calendar/reminders,
  normal event regression, safe areas/keyboard/large font and user-owned streaming.
- [ ] Merged rules/Storage/App Check/old-client compatibility and provider acceptance
  remain separate from mocked/local tests. Do not enforce App Check automatically.
- [ ] Before any later delivery activation review queued historical outbox, opt-outs,
  provider outcomes and notification consent; explicit authorization required.
- [ ] Nationwide promotion/city-management work has disabled gates and its own
  readiness documents; this registration release does not certify or enable it.
- [ ] Public-store submission requires separate approval after tester acceptance.
  Update store legal/data disclosures and verify current highest remote versions.

## Historical continuation - superseded where the current section differs

Last checkpoint: 16 October 2026, Australia/Sydney. Work is in progress.
Latest item 1 checkpoint: native local/Australia-wide promotion request and explicit
admin approval, server-only audience proof, preference-aware email/push, and national
feed visibility are coded behind disabled client/server gates. See
PROMOTION-AUDIENCE-2026-10-16.md. 27 focused tests and 14 regressions passed, 124 source
files parsed. Existing city coordinates use the same schema as new cities; saved
initial catalogue contains them all. No live seeding/deployment. PWA chat is actively
implementing items 2 and 3; do not claim them complete until its tested sync report.
User explicitly deferred item 4 (combined security/release setup/deployment).
Current city checkpoint (after bfa7a0e): server Events catalogue context and native/
lifecycle recurrence now use validated city definitions. Added gated Super Admin
Add City panel with Google city search, coordinate/timezone preview and server
re-resolution before atomic save. See CITY-MANAGEMENT-2026-10-16.md. No deployment
or flags enabled. 56 combined backend/city/registration tests passed and 124 source
files parsed. Physical-device/provider and production-rule acceptance still pending.
Read this file, root AGENTS.md and RELEASE-READINESS-2026-10-14.md before coding.
This is a continuation brief, not permission to deploy or publish.

## Working locations and ownership

- Project root: `C:\Users\sajja\Documents\Codex\2026-08-10\this-chat-is-for-community-events`.
- Canonical native checkout: `sdk51-package-backup` beneath that root. Repository
  `https://github.com/SAJ0786/CommunityEvents-Native.git`, branch `main`.
- Canonical PWA checkout: sibling `community-events-deployer`. Repository
  `https://github.com/SAJ0786/CommunityConnect-WebApp.git`, branch `main`.
- Never push to the former deployer (including Amazingly-Intelligent-Solutions).
  Its remote is reference-only and push-disabled. Do not bypass this guard.
- Keep existing checkouts; do not create new source copies. Preserve unrelated
  edits. Native untracked `codex-context.md` is historical user material, not this
  handover; its old OneDrive/scaffold instructions are not current checkout paths.
- PWA has a separate active chat: `01a0f5c5-6083-7790-b46b-bfc1c806e851`,
  “Community Connect — Web Version Development”. Coordinate before editing it.
  User explicitly authorised coordination. No subagents have been requested.

## Standing delivery instructions

1. Check incoming main changes before work. Test each coherent checkpoint, commit
   intended files only, push to the approved user-owned repository and verify the
   local SHA against remote main. Never force-push/discard another computer's work.
2. Windows Git credential-manager has failed with MSYS access denial. Git fetch
   works with network permission. Connected GitHub API can publish the exact tree
   with a non-force expected-parent lease; verify tree equality and fetch before
   aligning local history. Do not expose credentials. Report any sync blocker.
3. Implement code now. Do not build a partial fixes-only release: user wants ALL
   agreed features, including registration, before the test build. TestFlight first,
   then App Store; Android test APK/release follows separately.
4. No live-impacting Firebase rules/functions/configuration deployment without
   compatibility/release review. Isolated registration candidate is NOT deployed.
   Do not enable feature flags or send historical promotion campaigns by default.
5. Update this handover at each completed checkpoint and before stopping/limits.
   Record actual results and remaining work, not optimistic completion claims.

## Verified baseline before this continuation

Baseline before the current lifecycle checkpoint: local/GitHub main equal at `5d870c38563640490f7d8af5ed5fee89370996b1`.
No new native build or production deployment was made. Latest completed changes:

- `db01c17`: mandatory full name/contact email completion; newest-first joining
  dates in both admin lists. Review REGISTRATION-FIX-2026-10-01.md for required
  lifecycle callables/rules before distributing this client. Historical document
  mentions a temporary checkout; canonical checkout is now the one above.
- Promotion approval local-city email source; immediately on approval even for
  future-dated promotions. Do not assume deployed status without checking Firebase.
- Android manifest notification-channel conflict fix; shared safe-area root/modal
  handling protects both bottom bars; horizontal filter/category swipe candidate fix.
- Bulk Share Events admin entry restored with permission checks.
- Optional Home Update/Later store notice; held behind verified public store
  metadata. TestFlight alone must not activate a public update notice.
- Apple team D36Y75H5BU configured; production bundle info.siza.communityevents,
  App Store ID 6782770347. Local marketing version remains 2.0.0 while earlier store
  lookup was 2.1.0: resolve deliberately before any build. EAS build numbers remote.
- `ba9dc5f`: validated cached dynamic-city foundation, native selectors/prayer
  locations and candidate registration/promotion backends. See CITY-CATALOGUE-2026-10-14.md.
- `4d25a6f`: private venue coordinates/maps helper, poster replacement/removal,
  response retention and attendee cancellation erasure in candidate backend.
- `6f062c4`: selected-city prayer date/clock and absolute alarm instants; original
  Single Event / Recurring Event labels restored; new type “Registration only events”.

## Registration — exact user requirements

- Existing Single Event and Recurring Event names AND descriptions stay unchanged.
- New option: Registration only events. Its category inherits Add Event's dynamic
  event types, with a custom type option. Do not prefix existing types with Open.
- Detailed notes; full address selected/geocoded for maps/directions. Public sees
  suburb only; full address/coordinates/poster visible only to confirmed registrants,
  organiser and appropriately scoped admins/super admins. Never expose a public
  Storage download token for private posters. Public notes must not contain address.
- Ask templates versus own form first. Templates editable; up to 30 custom fields.
  Current model notes limit 5,000; agreement terms limit 1,000; agreement stays last.
  Tell host to write the actual terms whenever adding an agreement field.
- Closing date must be an EARLIER civil day than event day, not same day; validation
  immediately below the closing control. Use selected city's timezone.
- Attendee confirmation: edit entry / event details. Event card: Registered + edit.
- Host confirmation: edit event / edit form / event card. Host card: responses count
  and management. Real server permissions, not prototype viewer simulation.
- Keep answers until organiser deletes them, EXCEPT attendee cancellation/deletion
  immediately deletes submitted answers/question snapshots and releases seats.
  Minimal retry/cancellation metadata may remain; no copied answers in receipts.
- Organiser answer deletion does not itself cancel a seat. Explain difference.
- Same behaviour in native/PWA. No automatic 30/90-day retention expiry selected.

## Architecture and next implementation slice

Native prototype: src/components/RegistrationPrototypeScreen.js (memory-only).
Pure model: src/registration/prototypeModel.js; mirrored self-contained backend
model in backend/functions-registration. Client contract: registrationClient.js;
firebaseRegistration.js requires explicit enabled=true. Default stays disabled.
Backend: backend/functions-registration/registration.js and index.js; all callables
require App Check; EVENT_REGISTRATION_ENABLED defaults false. Separate codebase NOT
in production Firebase config. Existing legacy events remain separate.
Collections: registrationEvents, registrationEventPrivate, registrationForms,
registrationTemplates; registrations/operations subcollections. Private media prefix
registration-private. Deny direct client access; callables authorise first.

Native integration checkpoint now adds RegistrationScreen, RegistrationEditor,
RegistrationControls and registrationViewModel. It connects the callable adapters
for discovery, host save/templates, attendee submit/edit/cancel, confirmations,
approval, private poster/maps and response pagination/deletion/CSV text sharing.
Original prototype remains separate. ENV `EVENT_REGISTRATION_CLIENT_ENABLED=true`
sets Expo extra.eventRegistrationEnabled; no EAS profile sets it. Server flag is
separate and still off. New callable listRegistrationEvents supports public (city),
mine (owner), review (scoped admin/city), 25 scanned rows/page, opaque document-ID
cursor. Empty filtered pages may still have a nextCursor. Never discard that cursor.
Detail now returns canApprove/canRegister/canCancel and allowCancellation.
Keep both gates off until deployment/security/device acceptance. This is coded
integration, not a physical-device/UI acceptance pass or a finished release.

## Remaining release gates (do not mark all complete)

- [ ] Native/PWA production host builder, template persistence, attendee submission/
  edit/cancel/confirm, public discovery/cards, approval and response management.
- [ ] Wire real private address picker/maps/navigation and poster lifecycle into UI;
  dynamic event-type inheritance; retention and re-consent notices.
- [ ] Verify registration account-deletion trigger/worker in approved environment.
  User confirmed organiser account deletion must cancel upcoming events and notify
  attendees (16 October); this is now coded, with the attendee's own answer erasure,
  template cleanup and seat release. Existing non-registration account lifecycle
  remains unchanged. No live deployment; production/device acceptance still open.
- [ ] Complete dynamic-city consumers, especially recovered event-notification backend,
  recurrence and PWA. Old clients still have bundled lists. No live city activation yet.
- [ ] Local vs Australia-wide promotion request/admin approval, preference-aware
  delivery and tests. Do not expand audiences or ignore opt-outs silently.
- [ ] Merged Firestore/Storage security acceptance, App Check, old-client compatibility,
  real Firestore/Storage emulator integration and end-to-end flows.
- [ ] Release version/build profile, transferred signing/APNs/App Check verification.
- [ ] Physical iPhone/Android: registration, DST/reminder delivery, disappearing rails,
  Android three-button/gesture nav, keyboard, rotation, large font, store notice.

## Test commands and evidence

Run from native root:

    node scripts/verify-source.js
    npm run test:regressions
    npm run test:registration
    node scripts/test-prayer-timezone.cjs
    node scripts/test-prayer-reminder-zones.cjs
    node scripts/test-system-safe-area.cjs
    node --test scripts/test-event-registration-backend.cjs scripts/test-registration-venue.cjs scripts/test-city-catalogue.cjs scripts/test-promotion-email.cjs
    git diff --check

Last prayer checkpoint: 18 date/zone cases + legacy exact 60-minute reproduction,
mock iOS/Android schedule/cache/restart/location tests, 14 regression scripts, five
city catalogue tests and 119-file source check passed. Earlier candidate registration/
venue/city/promotion combined run: 30 tests passed. No physical verification.

Java blocker resolved without installation: existing Android Studio JBR is Java
21.0.10 at `C:\Program Files\Android\Android Studio\jbr`. Set JAVA_HOME to that path
and prepend its bin to PATH for the emulator command (process only).

    firebase emulators:exec --only firestore --project demo-registration-20261012 --config scripts/registration-emulator/firebase.json "node scripts/test-event-registration-emulator.cjs"

Latest Firestore script passed with exit 0 (concurrency, retry, templates, discovery,
private projection, cancellation answer erasure/access revocation, deny-all fixture).
CLI wrapper exited 1 AFTER successful script/shutdown because local Firebase update
config check failed. Do not misreport wrapper as clean. No production writes.
Only demo-registration-20261012 and 127.0.0.1:8398 accepted. Config/rules are now in
the repo, not dependent on outputs/. This is still NOT merged production rules,
Storage emulator or App Check integration acceptance.

Prayer report: PRAYER-TIME-INVESTIGATION-2026-10-15.md. Old shortOffset parser assumed
UTC+10 on AEDT/unavailable Intl, exactly reproducing reported -60 minutes. Numeric
Intl parts fix is in source; installed binary/runtime evidence still needed. No +1h
patch or calculation-method change. No configured expo-updates OTA path; plan new
native binaries. Azaan currently refreshes when prayer panel opens; verify on upgrade.

## Current continuation log

- Native registration integration above is implemented behind disabled gate; requires
  visual/device acceptance. All colours use shared theme tokens. Closing error is
  directly below date picker; full venue comes from existing address autocomplete.
- 36 combined backend/venue/city/promotion/integration tests passed; all 14 existing
  regression scripts passed after keeping the Home header's stable element contract;
  123-file source parse passed. Firestore emulator script
  passed as described above. Add `node --test scripts/test-registration-integration.cjs`
  to the command list. These are not mounted React Native interaction tests.
- USER DECISION, 16 October: do not involve admins in organiser edits to an already
  approved event. If registration fields change, email AND push all existing attendees
  asking them to review/edit their registration. Initial approval remains unchanged.
  Implemented in candidate code: edits/poster changes preserve approval; unchanged
  forms preserve formVersion; actual field/purpose changes version the form. Atomic
  registrationChanges outbox records form/date/venue changes without private data.
  Worker fans out to registrationNoticeDeliveries with email/push per current member;
  rechecks active account, cancelled/replaced booking and already-reviewed form.
  Sending claims avoid duplicate retries; uncertain/interrupted provider outcomes
  become review-required for operator follow-up rather than automatic resend.
  SMTP delivery uses existing secret names; new candidate package lock adds nodemailer.
  EVENT_REGISTRATION_NOTICES_ENABLED is an additional OFF-by-default gate. No sends
  or deployments performed. Production indexes are candidates only, not merged.
  Native push routes require correct recipient and feature gate, then load via callable.
  Email provides My registrations instructions (no unverified universal-link URL).
  Existing attendees can edit/reduce places until event day after closing; no new,
  reopened or increased bookings. Form changes with attendees blocked on event day.
  Host copy and attendee review notice updated; consent resets remain in place.
- Host cancellation implemented: cancelRegistrationEvent with role/revision/explicit
  confirmation, idempotent result, non-reopenable cancelled status, released places,
  no attendee private-venue/poster access and cancellation email/push outbox. Answers
  remain until organiser/attendee deletes them. Attendees may erase answers even
  after event cancellation. New list scope attending uses server-only per-member
  index registrationMemberEvents/{uid}/events; returns public projection only.
  Native My registrations exposes those events even when no longer publicly listed.
- Lifecycle checkpoint verification: 26 backend / 46 combined tests passed, 123-file source parse
  passed. Before adding host cancellation, all 14 regressions
  passed. Real isolated Firestore test passed approved-edit and concurrent outbox
  checks with MOCK email/push. Firebase CLI wrapper still fails its update check
  AFTER test success. Actual SMTP/FCM, Node 22 runtime, Storage and device acceptance
  remain required; local test runtime was Node 24. No production writes.
- Poster safety checkpoint: per-user 10 uploads/hour quota, durable cleanup intent
  before upload, 24-hour grace, referenced-object protection, leased retries and
  bounded cleanup batches implemented in candidate functions. Candidate composite
  index is separate; merge only during approved release. No production deployment.
  Storage operations remain mocked in these tests; real Storage acceptance pending.
  Checkpoint verification: 39 combined backend/venue/city/promotion/integration
  tests passed, candidate entry/maintenance syntax checks and git diff --check passed.
- Last verified native baseline before this checkpoint: bf4e5d2142fbca8ad80c25e7b17b85149fad6ea1.
- Lifecycle/notice checkpoint synced and verified at aec098c11136e202ced6172ba7daf3b883805ebd.
- Account deletion checkpoint adds accountCleanup.js: users deletion trigger creates
  a durable registrationAccountCleanup job; bounded host/attendee/template phases
  resume safely across concurrent retries. Upcoming hosted events cancel and queue
  notices; past hosted events stay unchanged. Deleted attendee answers/snapshots
  are removed and booked capacity decremented once; private templates are removed.
  Other attendees' answers on cancelled hosted events retain the agreed policy and
  scoped-admin management access. Main feature OR maintenance flag enables cleanup.
  No production Firebase changes. 28 backend tests passed; isolated real Firestore
  script also passed concurrent cleanup with mock delivery. CLI update-check warning
  still occurs after successful script. Updated backend README supersedes old pending
  reapproval/unfinished-screen descriptions. Non-registration privacy handling is
  outside this worker; support remains the route for further erasure requests.
- Next: production lifecycle/security (account deletion, delivery operational review,
  merged rules/Storage/App Check), PWA parity, dynamic-city worker migration,
  nationwide promotions, then release/device acceptance. No builds/deployments.
