# Hijri event date correction — 1 November 2026

Native Add Event now prefills today's device-local Hijri date on choosing Hijri and computes its Gregorian equivalent immediately, using the configured Hijri overrides. Completed earlier Hijri dates reset to today. Numeric day/year edits are resolved on blur so partial typing does not trigger a premature reset. Future selections remain intact. No existing stored events are modified. A valid converted date enables the existing prayer choices once the address has GPS coordinates.

Verified with scripts/test-hijri-event-date.cjs (today/local midnight, round-trip conversion, past reset, future preservation, incomplete year, overrides and prayer calculation), source/binding checks (147 files), and git diff --check. No physical iPhone test, OTA publication, backend deployment or store build performed for this correction. The change is prepared in the native source, shared by iOS and Android; the separate web app is unchanged.
