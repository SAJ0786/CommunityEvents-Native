# Add City — release candidate, not deployed

User requirement: show resolved coordinates before adding a city, store them and
reject additions if resolution fails. No guessed location or Sydney substitution.

## Implemented

- Native Events Admin overview: gated Super Admin Add City panel. Search for an
  Australian city/town, select result, display latitude, longitude and IANA timezone,
  enter unique short code, confirm addition. Uses shared theme tokens.
- Backend `cityManagement.js` exports searchCatalogueCities, previewCatalogueCity,
  addCatalogueCity through business-workflow. Authenticated active superAdmin and
  App Check required. Authorization rechecked inside save transaction.
- Google Places city autocomplete + Place Details. Coordinates remain numeric;
  country AU, locality type, state, coordinate bounds and real Australia/* timezone
  required. No fixed UTC offset: the IANA zone supports daylight saving.
- Save re-fetches place details and compares preview fingerprint, ignoring any
  client-provided coordinates/label/timezone. Failure or changed details blocks save.
- Atomic catalogue append preserves existing entries and rejects malformed catalogues,
  duplicate IDs/names within state/codes/near-identical coordinates, alias conflicts
  and catalogue size above 100. Disabled existing cities cannot be re-added.
- Direct client catalogue writes remain denied. No city was actually added.
- Events backend uses invocation-local validated catalogue snapshots, avoiding shared
  mutable definitions under concurrency. Recurrence checks use configured timezones,
  including disabled historical cities; unknown explicit cities fail closed.

## Activation / acceptance still required

1. Backend CITY_MANAGEMENT_ENABLED=true and native build
   CITY_MANAGEMENT_CLIENT_ENABLED=true are separate opt-ins. Neither enabled here.
2. Review Firebase compatibility and explicit deployment selection before publishing
   the three callables. Do not deploy the full codebase casually. No build/deployment
   authorised by Git sync. Existing store builds do not gain this UI automatically.
3. Test real App Check, role revocation, provider responses and concurrent adds in
   staging. Current automated tests use injected providers/database mocks, not live
   Google calls. Verify API key restrictions and Places field availability/billing.
4. Review Google Maps attribution/storage terms before enabling persistent provider
   coordinates in the shared catalogue; provider policy acceptance remains a release
   prerequisite, not established by these tests.
5. Test on iOS/Android (including keyboard, screen reader and small screens). Confirm
   refresh in another client; ordinary catalogue refresh is currently hourly/foreground.
6. PWA chat has the callable contract; its equivalent admin UI is not implemented by
   this native checkpoint. Promotion Australia-wide audience remains separate work.
7. New entries use city centre coordinates, NOT event venue coordinates. No postcode
   coverage is inferred; only the resolved locality alias is added. Adding a town does
   not reassign existing users/events or automatically define surrounding suburbs.

## Checks

- `node --test scripts/test-city-management.cjs scripts/test-city-catalogue.cjs scripts/test-event-registration-backend.cjs scripts/test-registration-venue.cjs scripts/test-promotion-email.cjs scripts/test-registration-integration.cjs`: 56 passed.
- `npm run check`: 124 JavaScript source files parsed.
- `npm run test:regressions`: all 14 regression scripts passed.
- `git diff --check`: passed (line-ending notices only).

Provider reference: https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places
(location and timeZone.id). Search types:
https://developers.google.com/maps/documentation/places/web-service/place-types
