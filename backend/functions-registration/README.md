# Event registration backend and Native integration

## Unified event discovery — 16 October implementation

This section supersedes the older rollout notes below. The registration codebase
is configured in `backend/firebase.json`; the new changes in this checkout have
not been deployed. Production notices remain OFF and callable App Check enforcement
is unchanged (false). Do not enable notifications or modify production records as
part of this implementation.

Native registration events now use the normal EventCard, EventDetailsModal,
Home ordering/search/filters, calendar and Favourites. Quick Access toggles
registration-only/all events; there is no registration menu item or browser page.
Only form entry, event/form editor, and response operations use RegistrationScreen.
Existing attendee booking/history cards live in My Events alongside hosted events;
attendee cards do not receive host management controls.
The host's My Events and Admin Event Management display pending cards with a large
`UnApproved` note. User Management contains a superAdmin-only approval panel,
initially spanning all cities, including disabled/former cities. Approval removes the note without
replacing it with an Approved badge. City admins retain city management but cannot
review or approve pending events through the approval scope.

### Shared callable contract (australia-southeast1)

- `listRegistrationEvents({scope, city, cursor})` returns `{events,nextCursor}`.
  Scopes: `public` (approved upcoming only), `mine` (current owner), `management`
  (city-scoped admin/superAdmin), `review` (superAdmin pending), `attending`
  (current account's registration history). City is required for public and
  management, optional for review, and omitted for mine/attending. Omitting city
  in review pages all cities. Consume every page, including empty filtered pages,
  until nextCursor is null. Native uses global review by default.
- Each row retains public event fields (id, title, eventType, date, suburb, notes,
  capacity, closes, city, timeZone, revision, status, formVersion,
  allowCancellation) and adds `ownerUid`, `registrationOnly`, `canManage`,
  `canApprove`, `isRegistered`, `canRegister`, `canEditRegistration`, `hasPoster`.
  Poster presence is only true for authorised managers/registrants. No private
  address, coordinates, form answers, poster URL or bytes occur on lists.
- `getRegistrationEvent({eventId})` retains its existing form, ownRegistration,
  retention and action flags. Its public event includes ownerUid for Contact Host.
  `privateDetails` remains exclusive to managers and confirmed registrants
  (cancelled events revoke attendee access). Poster bytes are fetched exclusively
  through `getRegistrationPoster({eventId}) -> {mime,base64}` and are not persisted
  in Native event feeds or a shared poster cache.
- `approveRegistrationEvent({eventId,expectedRevision})` is superAdmin-only.
- `deleteRegistrationEvent({eventId,expectedRevision,confirmation:'DELETE EVENT'})`
  returns `{eventId,revision,status:'cancelled',deleted:true}`. It atomically marks deletedAt/
  deletedBy, closes capacity, and queues the existing cancelled outbox while
  retaining participant history. Deleted rows are absent from discovery and
  manager lists; authorised detail/attending history remain available. Neither
  saving nor approving can resurrect cancelled/deleted events. Legacy
  cancelRegistrationEvent remains supported, but no Cancel Whole button is shown.
- Save, submission, templates, response deletion and poster upload/removal retain
  their prior arguments. Approved edits stay approved; changed questions/terms/
  purpose increment formVersion and require fresh attendee review/consent.

### Release and acceptance

#### Optional schedule and normal-event shortcuts

Save drafts may additionally contain `startTime` and `endTime` (empty string or
strict `HH:mm`). End requires start; equal clocks are invalid; an earlier end
clock means the following local day. City catalogue `timeZone` is authoritative.
DST gaps/overlaps are rejected rather than guessed. Public list/detail fields
include the clocks and server-derived ISO UTC `startAt` / `endAt` (null when
unspecified); supplied instants are ignored. Older saves omitting BOTH clock
keys preserve the existing schedule. Editors send both keys, including empty
strings for deliberate clearing. Schedule changes queue the existing date-change
outbox without changing bookings or formVersion. Notices remain OFF.

Native one-off calendars use exact city-derived instants. With no start time
they create a date-only all-day entry and disable timed reminders with a visible
reason. Missing end time does not invent a duration (zero-duration calendar
entry). Calendar location is public suburb only, never the private venue.
Favourite reminder time remains the previous day's 19:00, using the EVENT city
for registration events. Custom reminders subtract the chosen lead time from
the actual instant. Feed/detail refresh removes stale local reminders after
schedule/status changes; a device that remains offline cannot learn server edits.
Ordinary-event scheduling is unchanged.

Contact Host uses the existing authorized thread path with the projected owner
UID; registration IDs are not written to legacy event documents. The user chose
normal Public/Unlisted YouTube streaming. Approved managers receive Go Live /
Manage Live from the normal details card, including Admin Event Management.
Native start/resume/external-start/native-end/external-end calls carry
`eventCollection:'registrationEvents'`; ordinary calls retain the legacy default.
`getEventStream({eventId,eventCollection})` returns manager-only
`{watchUrl,sessionId,source,appVisibility}` when reopening an external stream.
No channel-URL fallback or direct client event writes are used.

Registration public detail/list projections add `isLive`, `liveUrl` (session ID
only), `liveWatchUrl` (validated YouTube URL only when visibility is public),
`liveAppVisibility`, `liveSource`, `liveStartedAt`, `liveVideoRecordId`.
Pending/deleted/cancelled streams are not exposed. Unlisted watch links are never
projected, even to managers; host controls retrieve them separately. Approved
event saves preserve only stored lifecycle fields, never client-supplied ones.
Registration streaming skips legacy live notifications and private-link emails.
Public/Unlisted links may be shared outside the app; this choice does not weaken
private poster or venue authorization.
The authoritative deployed `/cal` and streaming functions live in the Web repo's
`functions/index.js`, not this repo's recovered email source. `/cal` registration
support must ship there, limited to approved active public metadata/suburb and
the same all-day/UTC schedule contract (no venue/poster/registration answers).
Coordinated release must include the Web-owned collection-aware streaming,
health/cleanup/archive/thumbnail changes and getEventStream before enabling the
Native registration client. No notification/email delivery is enabled here.

No mirror is created in the legacy public `events` collection. Old clients
therefore cannot receive pending/private registration payloads. The new scope,
flags and deletion callable reuse existing query shapes; **no new rules or
indexes** are required by this slice. Deploy the registration functions before
enabling a client that uses deleteRegistrationEvent or management.

The Native build flag `EVENT_REGISTRATION_CLIENT_ENABLED` remains opt-in/off by
default. Enable deliberately only after coordinated backend/Web release and
device acceptance. Leave EVENT_REGISTRATION_NOTICES_ENABLED OFF; no email/push
delivery is enabled here. Preserve existing maintenance/cleanup gates. Exact
private map pins remain unavailable to public list/map feeds; authorised users
get directions through refreshed event details.

Local evidence: source check, backend and Native client/feed/view-model tests,
schedule/DST/calendar/reminder tests, private-venue tests and the Native regression suite pass. These checks do
not substitute for iOS/Android device, Storage/App Check or coordinated Web
acceptance. No Expo build or production deployment was performed.

## Earlier 16 October snapshot (superseded by the unified contract above)

- Initial events require superAdmin approval. Approved organiser edits and poster
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

- Pending event creation/edit with super-admin-only approval. City admins may manage events in their assigned city but cannot approve them.
- Strict earlier-day registration closing checks in the server-selected Australian timezone.
- Callable-only public event projection, separately stored full address and private poster path; no public events mirror or private fields on list responses. List cards include server-derived registration/management flags; poster presence is disclosed only to an authorised manager or registrant.
- Paginated `public`, `mine`, `review`, `attending`, and `management` lists. Public results are approved upcoming events only; review is super-admin-only and pending-only, and may omit city to page pending events across all cities (including disabled/former cities); management and public lists require a city.
- Only the organiser, authorised city admin/super admin, or currently registered attendee may retrieve private details. Other members cannot.
- Transactional seat reservation, edit deltas, optimistic registration/event revisions, stable create/submission retry identifiers, original question/terms snapshots, cancellation and access revocation.
- Owner/admin-only paginated response access and account-owned paginated templates.
- Revision-checked `deleteRegistrationEvent` soft-deletes with `DELETE EVENT`, marks the event cancelled/deleted, releases reserved places and queues the existing cancellation notice while retaining booking history. The existing `cancelRegistrationEvent` contract remains available.
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

`node --test scripts/test-event-registration-backend.cjs`: 29 backend tests.
`scripts/test-event-registration-emulator.cjs`: real isolated Firestore emulator checks event-creation retry, account-only templates, two concurrent requests for the final seat, retry deduplication, private view access, cancellation revocation, and direct unauthenticated read denial. The tested emulator rule file is an isolated deny-all rule; this is NOT a complete merged-production rule acceptance result.

Only project `demo-registration-20261012` and emulator `127.0.0.1:8398` are accepted by the emulator test. No real users, email or production data.

## Still required before rollout

16 October: native RegistrationScreen/Editor now connect the adapter behind the
disabled EVENT_REGISTRATION_CLIENT_ENABLED build flag. listRegistrationEvents is
a bounded city/owner/scoped-review/management endpoint; public list cards omit private fields.
New detail action flags are server-derived. Five native contract/view-model tests,
29 backend tests and the isolated Firestore emulator script pass. Native UI/device,
Storage/App Check and merged-rules acceptance remain pending. See COPILOT-HANDOVER.md
for current commands and the Firebase CLI post-test update-check warning.

1. Connect production host/attendee screens, discovery and event-card routing to the adapters. Current demo screens remain memory-only and native entry stays development-only.
2. Complete address-autocomplete integration and shared dynamic Add Event options. The preview asks the host to confirm the public suburb separately.
3. Verify poster remove/replacement cleanup against Storage emulator; finish orphan sweep/retry monitoring, upload rate limits, callable App Check/auth integration and organiser-controlled retention/account deletion.
4. Finalise registration edit deadlines, event changes after bookings, form-version UI re-consent, organiser cancellation, recurring/per-attendee scope and approved email policy. No booking emails are implemented.
5. Merged production Firestore/Storage rule acceptance, old-client compatibility and physical native/PWA end-to-end testing.
6. Deploy only in the coordinated release window, then enable deliberately. Old clients must never receive protected registration payloads in legacy events.

Do not mistake adapter/unit/emulator coverage for a finished production feature or an APK-ready release.
