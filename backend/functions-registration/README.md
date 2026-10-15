# Event registration backend candidate — NOT DEPLOYED

## Current status — 16 October (supersedes historical notes below)

- Initial events require scoped admin approval. Approved organiser edits and poster
  changes remain approved. Stable forms preserve formVersion; changed questions,
  terms or purpose require review of the new version.
- Existing attendees may edit answers/reduce places after closing until event day.
  New/reopened bookings and increased places remain blocked after closing.
- Atomic form/date/venue outbox and bounded fan-out create email/push jobs. Delivery
  rechecks active account, cancelled/replaced bookings and already-reviewed forms.
  No answers, questions, exact venue or poster URLs appear in messages/outboxes.
- Native push validates recipient/gate and reloads through the callable. Email gives
  instructions for My registrations, not an unverified universal link.
- Provider calls are claimed before sending. Uncertain/interrupted outcomes become
  review-required for operator investigation, not automatic resend. Exactly-once
  delivery by SMTP/FCM is not guaranteed. Missing email/tokens are recorded as skipped.
- Organiser cancellation requires confirmation/revision, releases places, revokes
  attendee private venue/poster access and queues notices. It cannot be reopened.
- Organiser account deletion cancels upcoming events and queues notices. Past hosted
  events remain unchanged. Deleted attendee accounts have their own answers and
  question snapshots erased by a resumable worker, with capacity released once.
  Their private templates are removed. Auth/non-registration deletion is unchanged.
- Other attendees' answers remain under the agreed retention policy after a host
  cancels or deletes their account; scoped admins retain management access. No new
  automatic retention period is introduced. Further privacy requests go to support.
- My registrations uses an account-scoped server index and includes cancelled/past
  events. Native address picker, maps, poster, templates and response UI are wired
  behind the disabled build flag, not merely prototype screens.
- Poster upload quota (10/member/hour) and durable pre-upload recovery intent,
  24-hour grace, reference checks and bounded leased cleanup are implemented.

Additional internal collections: registrationMemberEvents (events subcollection),
registrationChanges, registrationNoticeDeliveries, registrationAccountCleanup,
registrationPosterCleanup and registrationUploadLimits. No direct client allow
rules exist for these candidate paths. Merged authenticated-rule tests still needed.

Release controls: EVENT_REGISTRATION_ENABLED and native
EVENT_REGISTRATION_CLIENT_ENABLED remain off. EVENT_REGISTRATION_NOTICES_ENABLED
is an additional delivery gate. EVENT_REGISTRATION_MAINTENANCE_ENABLED allows
privacy cleanup if the main feature is disabled after launch. Do not stop cleanup
when rolling back UI access. Existing SMTP secret names are used only by the notice
worker. Merge candidate indexes only in the approved release window.

Verification: 28 backend tests pass. Isolated Firestore script passes concurrent
outbox/account cleanup with MOCK SMTP/FCM. CLI update check still fails after test
success/shutdown. No live email, push, data writes, build or deployment.
Still required: real Storage/App Check, merged rules, Node 22 runtime, approved
SMTP/FCM acceptance, operational monitoring for review-required jobs, old-client
compatibility, PWA parity and device acceptance. See COPILOT-HANDOVER.md.

## Historical implementation notes (14–15 October)

The older pending-edit and unfinished-screen statements below are superseded by
the current status above; they are not the current implementation contract.

Separate, feature-disabled codebase. Do not add to production firebase.json or deploy until release review. `EVENT_REGISTRATION_ENABLED` defaults off; callable exports require App Check.

## Implemented

- Pending event creation/edit with explicit admin city-scope approval. Existing open events are untouched.
- Strict earlier-day registration closing checks in the server-selected Australian timezone.
- Public event projection, separately stored full address and private poster path; no private fields in public response.
- Only the organiser, authorised city admin/super admin, or currently registered attendee may retrieve private details. Other members cannot.
- Transactional seat reservation, edit deltas, optimistic registration/event revisions, stable create/submission retry identifiers, original question/terms snapshots, cancellation and access revocation.
- Owner/admin-only paginated response access and account-owned paginated templates.
- Raster-only bounded poster upload through a callable, server-only Storage path, no bearer download URLs, authenticated poster retrieval. Uploading changes approval state to pending.
- Shared model validation and native/PWA transport adapters, disabled by default. CSV export neutralises spreadsheet formulas.

14 October code checkpoint (not deployed): private venue accepts allowlisted Australian
coordinates, place reference and address; only authorised private-details responses
include them. Invalid/mismatched coordinates are rejected; a text-only address edit
clears the old pin. Native/shared map-link helper supports Apple/Google directions.
Address autocomplete is not yet connected to the production form.

Poster replacement uses unique objects, cleans failed uploads and replaced objects,
and supports authorised revision-checked removal. Download rechecks access after
reading bytes. Cleanup is best-effort; orphan sweep/retry monitoring is still a
release gate. These unit tests do not replace Storage emulator/App Check tests.

## Confirmed answer-retention policy — 14 October

The user selected: **keep attendee answers until the organiser deletes them**,
with a later explicit exception: **attendee cancellation/deletion deletes their
form entries immediately**. The cancellation transaction replaces the response
with minimal cancellation metadata, releases seats once and revokes private
address/poster access. It retains no answers or question snapshots. Existing
operation receipts contain only hashes and result metadata, never the entries.
Do not silently introduce a 30/90-day automatic expiry. State this prominently
before submission. The candidate `deleteRegistrationAnswers` callable requires
organiser/scoped-admin access, an exact confirmation and latest response revision.
It irreversibly clears answers and question snapshots without cancelling the
booking or changing capacity. Minimal booking/retry metadata remains; this is not
complete account erasure. Replayed submissions cannot restore deleted answers.
The UI confirmation/notice, account-deletion/privacy requests and complete lifecycle
integration remain release gates. No retention cleanup has been deployed.

Collections: `registrationEvents`, `registrationEventPrivate`, `registrationForms`, `registrationTemplates`; event subcollections `registrations`, `operations`. Storage prefix: `registration-private`. Existing production candidate rules have no allow matches for these paths, so direct client access is denied. Callables use Admin SDK only after explicit authorisation.

## Evidence

`node --test scripts/test-event-registration-backend.cjs`: eight factory tests.
`scripts/test-event-registration-emulator.cjs`: real isolated Firestore emulator checks event-creation retry, account-only templates, two concurrent requests for the final seat, retry deduplication, private view access, cancellation revocation, and direct unauthenticated read denial. The tested emulator rule file is an isolated deny-all rule; this is NOT a complete merged-production rule acceptance result.

Only project `demo-registration-20261012` and emulator `127.0.0.1:8398` are accepted by the emulator test. No real users, email or production data.

## Still required before rollout

15 October: native RegistrationScreen/Editor now connect the adapter behind the
disabled EVENT_REGISTRATION_CLIENT_ENABLED build flag. listRegistrationEvents is
a bounded city/owner/scoped-review endpoint; public list cards omit private fields.
New detail action flags are server-derived. Five native contract/view-model tests,
16 backend tests and the isolated Firestore emulator script pass. Native UI/device,
Storage/App Check and merged-rules acceptance remain pending. See COPILOT-HANDOVER.md
for current commands and the Firebase CLI post-test update-check warning.

1. Connect production host/attendee screens, discovery and event-card routing to the adapters. Current demo screens remain memory-only and native entry stays development-only.
2. Complete address-autocomplete integration and shared dynamic Add Event options. The preview asks the host to confirm the public suburb separately.
3. Verify poster remove/replacement cleanup against Storage emulator; finish orphan sweep/retry monitoring, upload rate limits, callable App Check/auth integration and organiser-controlled retention/account deletion.
4. Finalise registration edit deadlines, event changes after bookings, form-version UI re-consent, organiser cancellation, recurring/per-attendee scope and approved email policy. No booking emails are implemented.
5. Merged production Firestore/Storage rule acceptance, old-client compatibility and physical native/PWA end-to-end testing.
6. Deploy only in the coordinated release window, then enable deliberately. Old clients must never receive protected registration payloads in legacy events.

Do not mistake adapter/unit/emulator coverage for a finished production feature or an APK-ready release.
