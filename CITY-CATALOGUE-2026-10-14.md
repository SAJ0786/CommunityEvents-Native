# Server-managed cities: implementation checkpoint

Code only. No production document, rules or functions deployed.

## Contract

Public configuration document: `settings/cityCatalogue` with `schemaVersion: 1`
and `cities` (1–100 entries). Each entry has:

- Stable lowercase `id`, human-readable `label`, uppercase short `code`.
- `enabled` boolean and integer `order`.
- Australian `state`, IANA `timeZone`, numeric `latitude` / `longitude`.
- `aliases` for whole-name address matching and inclusive `postcodeRanges`.

The bundled catalogue in `src/utils/cities.js` is the starting template. A synthetic
Darwin entry in `scripts/test-city-catalogue.cjs` demonstrates adding a city.
Do not publish that test data without reviewing actual service coverage.
Postcode ranges and aliases must not conflict between entries. Existing bundled
IDs are required. Disable rather than delete an ID, including subsequently added
cities, to retain historic member, business and event associations.

`rest-of-australia` has blank state/timezone and null coordinates: it is not one
geographical prayer location. Prayer panels must not substitute Sydney for it.

## Implemented

- Native startup/foreground fetch, eight-second timeout, one-hour success throttle,
  deduplicated reads, persistent validated last-known-good cache and bundled fallback.
- Reactive selectors, event classification, organiser grouping and prayer panels.
- Unknown IDs retained instead of mapping to Sydney. Disabled cities leave the
  selectable list but keep historical labels and associations. Unknown locations
  have no prayer calculations; outdated location alarms are cancelled.
- Coordinates/timezone changes invalidate reminder schedules.
- Registration candidate validates the complete catalogue in its transaction.
- Promotion-email candidate reads a per-invocation catalogue, rechecks delivery
  eligibility and refuses malformed configuration. Missing catalogue retains the
  existing city-email behaviour. No nationwide audience expansion is made here.
- Catalogue copies in both Firebase source packages are parity-tested against the
  native model, so each deployable package is self-contained.
- Candidate Firestore rule exposes read-only catalogue configuration; clients,
  including admins, cannot overwrite it. Server/IAM access remains privileged.

## Activation gates — not complete

1. Migrate remaining event-notification/recurrence consumers and PWA to this contract.
   The recovered events backend still contains a fixed city list; do not activate
   additional cities until it is reconciled. A new city must not be routed to Sydney.
2. Audit installed-client compatibility, notification subscriptions/preferences,
   geocoding classification, city-admin scoping and all postcode coverage.
3. Test deployed rules with emulator identities and test real native/PWA cache,
   offline refresh, disabled cities and timezone behaviour.
4. Review and deploy the additive prerequisites in a coordinated release window.
   Stage a catalogue containing existing cities before enabling any additional city.
5. Publish the native update first. Old installed builds still have fixed lists;
   server-managed additions become build-free only for upgraded clients.

No operator write/publish command is included deliberately: this is not a live
configuration change or approval to deploy.

## Android navigation checkpoint

The main root uses the measured four safe-area edges. Both bottom menus remain
non-absolute, non-shrinking children inside that root. Modal roots measure their
own safe area. No guessed Android navigation-bar height or duplicate footer inset
is added. Source/JSX composition tests cover both modules.

Physical acceptance remains mandatory: Android three-button and gesture modes,
portrait/landscape, large font, keyboard open/close, menus and modal pickers; iPhone
home-indicator regression. The currently installed binary will not change until
the next APK/store update.
