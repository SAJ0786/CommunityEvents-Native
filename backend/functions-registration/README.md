# Event registration backend and Native integration

## Independent recurring registrations - 17 October follow-up (deployed)

User chose separate registrations, capacity and closing for every occurrence.
The additive `createRegistrationSeries` callable creates 2..100 independent pending
events in ONE transaction (yearly at most 5; other frequencies within one year,
yearly within four years). Bounded serialized event/form/private data must fit
8 MiB; larger requests fail before any write rather than partially creating.
Following separate authorization for the Web release prerequisite, the 20-function
registration codebase is deployed from clean `acae2b7` (source identical to
implementation `1efe733`). All 20 ACTIVE, including
`createregistrationseries-00001-xuh`; deployed source archive matches all 16
tracked JS/MJS/JSON package/source files. Runtime gates remain true/false/true
(enabled/notices/maintenance), existing secrets and App Check behavior preserved.
No migration, index, rules, delivery activation or real participant writes.

Request:

```js
{
  city, createKey, draft, // existing flat event/form/private venue draft
  recurrence: {
    calendarType: 'gregorian', // or 'hijri'
    frequency: 'week', // 'day', 'week', 'month', 'year'; fortnight = week / 2
    repeatEvery: 1, // integer 1..100
    endMode: 'count', // or 'date'
    occurrenceCount: 4, // count mode: 2..100, yearly 2..5
    // endDate: '2027-01-01', // Gregorian date end, inclusive
    // startHijri: { day: 1, month: 7, year: 1448 }, // required Hijri cadence
    // endHijri: { day: 1, month: 9, year: 1448 } // Hijri date end, inclusive
  },
  occurrences: [
    { date: '2026-12-01', capacity: 30, closes: '2026-11-30T18:00',
      startTime: '18:30', endTime: '20:00' }
    // ... all exact rule-generated occurrences; do not submit a partial preview
  ]
}
```

First occurrence must match draft date/capacity/closes/clocks. Each row requires
all five fields; empty closes/clock strings retain the existing date-only/default
event-day closing semantics. Different capacities and earlier closing dates/times
are permitted on each row. Every row is independently validated, including DST
gaps/overlaps, private address rules, enabled city and already-closed bookings.
Only the shared draft may contain venue/contacts/form metadata. No row can inject
owner/status/approval/media paths. Clock instants always derive from the city;
prayer clients must calculate each occurrence, not reuse the first seasonal time.

Server regenerates dates using the rule; Hijri cadence uses authoritative
`settings/hijriCalendar.overrides`, never client-provided overrides. Stale Hijri
preview fails visibly; accepted retries resolve their receipt even if the calendar
later changes. Gregorian/Hijri cadence matches normal Native recurrence, including
month clamping and five-yearly-occurrence limit. Duplicate/non-increasing lunar
dates are rejected rather than silently reserving multiple events for one date.
Occurrence Hijri parts/display are canonicalized on creation; Gregorian recurrence
does not falsely repeat the first occurrence's entered-Hijri metadata.

Response: `{seriesId,events:[{eventId,revision:1,status:'pending'}]}`. Stable
createKey + canonical payload is idempotent; changed payload under the same key
fails `already-exists`. `registrationSeries/{seriesId}` is a callable-private
receipt containing owner, fingerprint and creation result, no answers/contacts.
All event, private and form documents commit atomically; no participant writes,
notification outbox or delivery occur on creation.

Detail/list event projections add immutable creation provenance:
`seriesId`, zero-based `occurrenceIndex`, `occurrenceCount`, `recurrenceRule`.
Existing `saveRegistrationEvent`, approve, booking, cancellation, delete, streaming,
calendar and staged edits operate on ONE occurrence. Rule provenance never
regenerates siblings when editing/moving one date; drafts cannot forge it.
No series-wide edits/deletion/approval or shared booking/capacity is implemented
or implied. Each private poster must upload through its own event/revision callable;
report and retry individual failures without recreating the series or sharing paths.

Client `createRegistrationClient.createSeries` is an explicit separate action;
existing single-event `save` remains unchanged. The backend prerequisite is live;
already-delivered Android build 97 does NOT contain this follow-up. User owns
building both final Native platforms; no additional agent build/submission.
Native supports preview/review of each occurrence's capacity, closing and clocks,
with per-date prayer recalculation, immutable retry snapshots, quota-aware private
poster uploads and My Events confirmation routing. Existing edits/copies never
implicitly create a series. Native keeps its shared normal-form step followed by
registration settings, rather than claiming Web's exact new single-page field order.

Source acceptance: 99 targeted backend/Native/recurrence/schedule/stream/privacy
tests, 130-file source check, release check, 14 regressions and prayer timezone
fixtures pass. This remains local mocked/runtime validation, not production
Firestore transaction/device/provider acceptance.

## Staged changes and normal-form parity — 17 October source update

**Deployed from `1848a20` on 17 October, all 19 functions ACTIVE.** This section supersedes older statements that approved edits
publish immediately. The user chose to keep the last approved version live
while a separate submitted revision awaits superAdmin approval.

`registrationEvents`, `registrationForms` and `registrationEventPrivate` always
remain the published version. Approved saves write a complete snapshot to the
callable-only `registrationPendingChanges/{eventId}` collection and increment
the event's control `revision` / `hasPendingChanges`, but do not change published
date, times, form, formVersion, capacity, venue, contacts or poster. Bookings,
public feeds, `/cal`, stream metadata and active streams continue to use the
published version. No public mirror, rules change, index or record migration
is needed; unmatched Firestore collections are denied by the existing rules.

### Client/review contract

- `getRegistrationEvent({eventId})` top-level `event`, `form`, `privateDetails`
  **always refer to published content**, even for a host registering themselves.
  Managers additionally receive `event.hasPendingChanges` and, when present,
  `pendingChanges:{event,form,privateDetails,submittedAt,submittedBy}`.
  Only editor/review code selects `pendingChanges || detail`; attendee entry and
  ordinary cards continue to use the top level. Pending private details use the
  same safe projection (no Storage paths). Lists never include pending content.
- `canApprove` is true only for superAdmins when the event is initially pending
  or approved with submitted changes. `review` scope includes both. Ordinary
  city admins may manage/edit/review content but cannot approve. `status` stays
  `approved` while changes await approval, so it must not be the only approval
  button condition.
- Approved `saveRegistrationEvent` returns
  `{eventId,revision,status:'approved',hasPendingChanges:true}`. Subsequent
  saves replace the submitted snapshot, revision checked. Initial events keep
  the existing pending workflow.
- `approveRegistrationEvent({eventId,expectedRevision})` promotes the submitted
  event/form/private details atomically, rechecks city validity, capacity against
  the latest bookings and event-day form restrictions, and retains latest
  booking counters and streaming fields. Promotion increments revision again;
  changed forms use that version, stable forms retain their prior version.
  Reload after approval; never predict revisions. Existing date/form/venue
  outbox and attendee consent review begin **only on promotion**. Notices stay OFF.
- Poster upload/removal on approved events stages the change too. Published
  poster access is unchanged until approval. `getRegistrationPoster({eventId})`
  defaults to published; `view:'pending'` selects a manager-only pending poster.
  There is no pending-to-published fallback. Cleanup protects both referenced
  versions, then retires replaced media after the existing grace period.
  Cancellation/deletion/account cleanup discard staged drafts and queue orphan
  media cleanup while preserving published booking history.

### Normal-form field mapping

Registration event editors reuse the normal Native/Web event form with a
private-poster mode. Existing registration-specific capacity, closing date,
cancellation setting, form questions/purpose and title remain. Explicit times
remain optional; overnight and timezone conversion retain the schedule contract.
Legacy events with no saved clocks remain date-only until a host enters times;
there is no way to recover an unspecified clock safely.

Additional flat draft/public descriptive fields: `hostName` (80),
`organiserType` (100), `organiserId` (128), `organiserName` (160),
`organisationType` (80), `isOnBehalfOf` (boolean), `eventSubject` (160),
`audienceType` (80), `speakerName` (160), `reciters` (up to 20 entries with
`type`/`customType` up to 80 and `name` up to 160), `timeMode` (`manual`/`prayer`),
`prayerName` (40), `prayerLabel` (80), `prayerOffsetMinutes` (integer -360..360),
`prayerTimeZone` (authoritative city zone in prayer mode), `hijriDate` (100),
`enteredAsHijri` (boolean), `hijriDay` (1..30), `hijriMonth` (1..12),
`hijriYear` (1300..1700); Hijri parts may be null. Normal forms calculate the
explicit prayer HH:mm, and the backend derives exact UTC without guessing.
Normal payload `eventDate` maps to registration `date`; normal address object
maps to private `venue`, `address` string and public `suburb`.

`hostPhone` (80) and `hostContactOptional` (254) are **private**, stored beside
the venue and projected only in authorized `privateDetails`, never public
event/list/calendar/stream data. Do not rename hostContactOptional to
hostContactEmail. Omitted new fields preserve prior values for older clients;
explicit empty strings/arrays clear them. Descriptive organisation selection
does not grant ownership, admin permission or contact visibility.

Pending-aware Web is live (Hosting `aa458d7a89f29384`); Native tester build 97
contains this staged contract, while iOS provisioning is pending local Apple
authentication. Native production client profiles remain disabled; dedicated
authorized tester profiles enable registration only. Notices remain OFF and
App Check enforcement unchanged. See root `COPILOT-HANDOVER.md` for exact evidence.

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
