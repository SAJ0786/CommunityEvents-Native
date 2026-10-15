# Community Connect Australia — Copilot / next-agent handover

Last checkpoint: 16 October 2026, Australia/Sydney. Work is in progress.
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

Native local and GitHub main verified equal at `6f062c44560c534ba97354ed8d74e4accd34986a`.
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
- [ ] Safe form/event changes after bookings, organiser cancellation and notifications;
  upload rate limits, durable orphan cleanup/retries, complete account/privacy deletion.
  These policies are not all final; ask for consequential product decisions.
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
  This decision has been sent to the web chat. IMPLEMENTATION STILL REQUIRED:
  current candidate sets edits/poster changes pending. Preserve approval for approved
  edits, detect actual form changes, version forms accordingly, create durable
  idempotent delivery jobs, recheck active registrations before sending, and add
  notification deep links. Never include private answers/address in notifications.
  Review editing after closing: an attendee must actually be able to respond to the
  update request without reopening new registrations or increasing occupied seats.
  Update host confirmation copy too. Consent boxes already reset on attendee edit.
- Poster safety checkpoint: per-user 10 uploads/hour quota, durable cleanup intent
  before upload, 24-hour grace, referenced-object protection, leased retries and
  bounded cleanup batches implemented in candidate functions. Candidate composite
  index is separate; merge only during approved release. No production deployment.
  Storage operations remain mocked in these tests; real Storage acceptance pending.
  Checkpoint verification: 39 combined backend/venue/city/promotion/integration
  tests passed, candidate entry/maintenance syntax checks and git diff --check passed.
- Last verified native baseline before this checkpoint: bf4e5d2142fbca8ad80c25e7b17b85149fad6ea1.
- Next: production lifecycle/security (upload limits/cleanup, account deletion,
  host cancellation/re-consent policy), PWA parity, dynamic-city worker migration,
  nationwide promotions, then release/device acceptance. No builds/deployments.
