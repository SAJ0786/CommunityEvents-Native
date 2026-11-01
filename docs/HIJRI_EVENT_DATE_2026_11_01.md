# Hijri event date correction â€” 1 November 2026

Native Add Event now prefills today's device-local Hijri date on choosing Hijri and computes its Gregorian equivalent immediately, using the configured Hijri overrides. Completed earlier Hijri dates reset to today. Numeric day/year edits are resolved on blur so partial typing does not trigger a premature reset. Future selections remain intact. No existing stored events are modified. A valid converted date enables the existing prayer choices once the address has GPS coordinates.

Verified with scripts/test-hijri-event-date.cjs (today/local midnight, round-trip conversion, past reset, future preservation, incomplete year, overrides and prayer calculation), source/binding checks (147 files), and git diff --check. No physical iPhone test, OTA publication, backend deployment or store build performed for this correction. The change is prepared in the native source, shared by iOS and Android; the separate web app is unchanged.

## Published Hijri date OTA — 2 November 2026

Source: 152954e3b620f28c2ac9a46db77b8b9dc2d65630. Production OTA for both platforms; store binaries remain iOS 2.1.1 (16) and Android 2.1.1 (110). Prefills today on selecting Hijri, converts immediately, and validates completed day/year edits on blur. Past completed dates reset to today. Tests, source checks and production runtime compatibility passed. Both live production manifests verified at 2026-11-01T19:33:24.362410+00:00. Device application is not claimed. No web or backend deployment.

- ios: group 97a249f8-6dde-413f-9415-f5f22ef8293a, update 01a19895-5752-7629-b749-a60089d1304a, runtime b1f045e738e61629962eb354595e34e2c39b75e6. Rollback group 2a2df1fd-724f-410b-980c-c02b18ff0467.
- android: group 930648c4-9712-44ab-a547-424f4348d2b6, update 01a19895-5752-744a-ad6c-ae9cff92d088, runtime 1ac7a2d1933a73b82d980e77f72cf46088efa61e. Rollback group 3be180d5-9284-41a0-a387-f648f5b0a341.
