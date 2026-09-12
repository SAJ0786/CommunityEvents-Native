# Contact, notification and mobile UI fixes — 12 September 2026

## Baseline

Fetched GitHub before editing. Local `main` and `origin/main` both pointed to
`37680c5` (Copilot PR #7), with a clean worktree. Those changes were retained.
No bundle IDs, Android application IDs, signing certificates, Team IDs or keys
were changed by this batch.

## Changes

- Contact Host: the live rules used `get` when authorizing a message whose parent
  thread is created in the same batch. The existing local rule correctly used
  `getAfter`. Published only that targeted correction to the live rules.
- Host unread counters now use a nested map in merged writes, not literal dotted
  field names. Host and business replies atomically update messages and previews.
- Host/business conversation listeners preserve data and expose errors instead
  of silently replacing the inbox with an empty array.
- Contact Events/support first-contact reads tolerate the missing-document rule
  restriction; follow-up messages preserve protected identity/routing metadata
  and the original creation date. Actual writes remain subject to server rules.
- Both owner inboxes now link to their separate contact-team/support inbox. Host
  requests for events without an assigned account explicitly say that the city
  admin team receives the request; they no longer claim host delivery.
- Shared keyboard-aware scrolling measures the focused input, reserves iOS
  keyboard space, and responds to multiline growth. Contact forms avoid applying
  keyboard padding twice. Notification appeals also have keyboard avoidance.
- The header bell opens a dismissible drawer using the same notifications
  component as the full page. Clearing marks updates read and dismisses them on
  this device for both views; server history and moderation notices remain.
- Header titles are “Events” and “Business directory”, below “COMMUNITY CONNECT”.
- Event details use the Menu drawer's header-only swipe recognizer, avoiding
  competition with content scrolling, with matching dismissal thresholds.
- Admin user cards have tighter spacing and accessible icon actions. Existing
  account-action confirmations and permission checks are preserved.
- Back controls moved to the left in admin sections, inbox, feedback and streamed
  videos. Hijri Calendar now has a top-left back control.
- Azaan: added a 17.5-second mono PCM WAV for iOS notification sound; Android uses
  a versioned notification channel with notification audio usage. Playback from
  a deliberate notification tap respects iOS silent mode. Notification delivery
  no longer also triggers duplicate foreground player playback/navigation.
- Azaan player participates in layout above the bottom navigation, with clearance
  for the raised central button, instead of an absolute bottom offset.

## Production rules change

Project: `community-event-8b639`.

- Published ruleset: `cca28dde-86b0-498c-a766-666d2a372947`.
- Previous ruleset retained: `d0f92e75-9342-4787-b3d4-39ea86206964`.
- Only change: host message creation uses `getAfter` for parent authorization.
- No bulk deployment of unrelated local rules; no messages or accounts modified.
- Five existing business threads were checked using routing metadata only. Their
  sender/owner participants and current business owner routes matched. This does
  not establish that device listeners or a particular user's session are healthy.

## Verification

- `npm run check`: passed (92 source files).
- `npm run test:regressions`: passed, including new mocked messaging/notification
  tests for atomic replies, current owner, guest/self restrictions, errors,
  first/repeated feedback, persistent clearing and supported WAV format/duration.
- `npm run check:release`: passed.
- iOS and Android development JavaScript exports: passed.
- Production export was blocked by the intentionally required protected
  `GOOGLE_MAPS_API_KEY`, absent locally. The safeguard was not removed. CI needs
  its existing key. No signed native build or physical-device test was performed.

## Required device acceptance checks

1. With two registered accounts, send Contact Host, verify recipient inbox and
   unread count, reply, and verify sender sees the reply. Repeat for Contact
   Business. Verify the recipient is the current owner after an ownership transfer.
2. Send Contact Events and directory support twice, then open Inbox → feedback/
   support. Verify sender history, city-admin queue and replies. Check a normal
   member account as well as Super Admin (their rule access differs).
3. On iPhone and Android, focus low fields, change fields with keyboard already
   open, and type multiple lines in contact/reply/edit forms. Text and submit
   controls must remain reachable.
4. From both modules, open the bell, dismiss by swipe/backdrop/close, and verify
   the underlying page does not change. Clear and reopen; new updates should
   still appear. Moderation notices should remain available.
5. Swipe down from event drawer header/handle, including after scrolling its
   content. Check Menu gestures, admin cards and left-side back controls.
6. Build new iOS/Android binaries. Enable Azaan for a prayer and allow notification
   sounds. Test foreground, background and locked screen; then repeat in silent
   mode. Focus/Do Not Disturb and OS notification settings can suppress sound.
   Tap the notification and verify player, timer and Stop remain fully visible.

The iOS WAV is a native notification resource copied during Expo prebuild; an
OTA JavaScript update alone cannot add it to an already installed binary.
This uses ordinary notification sound, not a critical-alert or alarm entitlement,
and does not promise a full multi-minute Azaan while the app is terminated.
