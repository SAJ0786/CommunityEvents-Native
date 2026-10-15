# Event registration backend candidate — NOT DEPLOYED

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
