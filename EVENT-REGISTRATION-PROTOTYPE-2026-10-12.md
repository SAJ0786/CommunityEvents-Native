# Event registration prototype checkpoint

## Scope and release boundary

The user approved prototype screens first, then backend wiring and testing. Web deployment may follow readiness; native builds remain held for the next coordinated release. Firebase changes that affect installed clients remain held. No production deployment is part of this checkpoint.

## Implemented locally

- Add Event labels are Open Single Event and Open Recurring Event. Their existing handlers and permissions are unchanged.
- A Registration Required Event choice is available only when `__DEV__` is true. It opens a standalone prototype, not the existing event submission service.
- Native prototype includes event setup, a question builder, required fields, choice options, question ordering, a session-only draft/template, attendee input validation, demo confirmation and read-only response snapshots.
- Matching isolated PWA prototype is in `community-events-deployer/src/registration` with `tests/registration-preview` and `tools/preview-registration.mjs`.
- Both models are byte-identical. Feature colours use native theme / web semantic tokens.
- There are no Firebase calls, real sign-ins, notification sends, bookings, durable drafts or actual capacity reservations in these prototypes. All entered data is in component memory.

## Verification

- Eight web contract tests passed, including native/model parity, required fields, capacity input checks, options, consent and immutable demo responses.
- Isolated Vite prototype bundle builds successfully, without Firebase or service-worker imports.
- Native source checker parses 111 files successfully.
- Browser review is blocked: the retained server prints port 5196, but both localhost and 127.0.0.1 time out from the available browser. This is not visual acceptance or native device acceptance.

## Review locally

From a normal Windows terminal, run `community-events-deployer/preview-registration.cmd`, then open http://127.0.0.1:5196/.

Alternatively open `community-events-deployer/.qa-registration-preview/registration-preview.html` in a normal browser. The build exports this self-contained offline file; no server is needed. The agent's browser cannot open file URLs and loopback requests time out, so visual acceptance is still unverified. Review this prototype before the server integration milestone.

Review: choose Registration Required Event; set a date; build and reorder questions; save/use a session template; preview and submit fictional attendee details; inspect the organiser response. Reload clears all demo data.

The native screen requires a development runtime containing the current source. It is not present in installed release binaries; no new binary was made.

## Remaining implementation

This is not a release-ready registration system. Still required: authenticated identity and eligibility, owner/organisation/admin scope enforcement, protected detail storage and read paths, immutable published form versions, transactional/idempotent bookings, cancellation, real closing times and timezones, per-attendee repeatable questions, durable templates/drafts, CSV protection/auditing, notifications if included, deep links, backward compatibility and emulator/device/security acceptance.

Production rollout must prevent older clients from reading private data or overwriting registration settings. Existing open events must continue unchanged. No existing event is converted by this work.

## Parallel backlog work

- Prayer calculator uses numeric timezone parts rather than parsing shortOffset or guessing UTC+10. Unknown/invalid timezone calculation returns unavailable. Hijri screen date refreshes on foreground/day change. Prayer reminders record a calculation version and refresh the old schedule on eligible initialisation.
- Horizontal KeyboardAwareScrollView instances no longer install vertical keyboard reveal handlers/insets. Event filter strip disables vertical bouncing and automatic inset adjustment.
- Both have focused passing tests. Physical device testing, reminder scheduling across device/city timezones and reproduction of the original disappearing-strip issue remain pending. These are code fixes, not fixes already delivered to installed apps.

## Git and collaboration

Only native changes and separately owned prototype files are included in this work. The separate web chat is actively modifying the shared PWA checkout and was notified with user approval. Its existing files must not be bundled into a prototype commit without coordination. The PWA prototype currently depends on that chat's uncommitted shared token stylesheet.

GitHub authentication is currently blocked in this session by a Windows MSYS/credential-manager access error. A successful local commit is not a successful remote push.

Local native commits: `d3ddf12` contains the prototype; `5ff295a` contains the timezone/horizontal-scroll changes. A direct push to `origin main` was attempted and failed at credential-manager authentication. No remote update is claimed.

## Remaining next-release queue

The user also approved implementing the wider code backlog. This checkpoint does not complete it. Remaining items are Android system-navigation insets, server-managed city catalogue and consumers, owner/admin promotion-audience controls and safe national targeting, admin bulk-share availability review, and the pre-existing streaming lifecycle regression. Member profile completion and newest-first admin sorting are already coded but still need deployment/device compatibility acceptance. All production-affecting Firebase deployment holds remain in place.
