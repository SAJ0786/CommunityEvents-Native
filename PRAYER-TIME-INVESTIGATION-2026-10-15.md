# Prayer-time discrepancy: code correction and device acceptance

Status: source regression reproduced and corrected; physical iOS/Android acceptance
pending. No build, OTA, Firebase deployment or store submission performed.

## A. Root cause and evidence boundary

Historical source at `435f6ec`, `src/services/prayerTimes.js`, requests Intl's
`shortOffset`, parses only `GMT+/-...`, and silently returns **10** when parsing or
Intl fails. An engine returning `AEDT` therefore computes Sydney winter times
even in daylight saving. Replaying that actual historical source with simulated
`AEDT` versus `GMT+11` produces exactly 60 minutes difference for all seven prayers
on 2026-10-14. The numeric-component correction was already present in current
source before this investigation; it must reach the installed binary to help.

This is a demonstrated code defect matching the report, not proof of the precise
Intl output in the user's installed iPhone build. Installed build numbers, source
revisions and physical runtime diagnostics are still needed to distinguish engine
behaviour from differing installed versions. Automatic phone time does not repair
the old parser. Android's UTC+11 result agrees with the selected IANA zone, not
merely with an assumption that the later time is correct. Independent religious
timetable certification is outside this timezone correction.

Sydney reference output (city centre coordinates -33.8688, 151.2093):

| 14 October 2026 | Legacy AEDT fallback | Correct numeric offset |
|---|---|---|
| Fajr | 04:00 | 05:00 |
| Sunrise | 05:16 | 06:16 |
| Zohrain | 11:41 | 12:41 |
| Asr | 15:18 | 16:18 |
| Sunset | 18:07 | 19:07 |
| Maghreb | 18:22 | 19:22 |
| Isha | 19:13 | 20:13 |

## B. Existing architecture

- Native iOS and Android share local `calculatePrayerTimes`; there is no prayer
  API or Firebase timetable response in this panel's calculation path.
- The city catalogue supplies centre coordinates and IANA timezone, with a bundled
  and validated cached catalogue. Event forms instead pass their venue address.
- The existing solar mathematics remains unchanged: Jafari, Fajr 16 degrees,
  sunrise/sunset 0.833 degrees, Maghreb 4 degrees with the existing seven-minute
  minimum, Isha 14 degrees, Asr factor 1. Event-specific minute adjustments remain.
- Results are already local `HH:mm` strings, rendered directly by the panel.
  There is no second display conversion and no persisted panel timetable cache.
- Event creation/recurrence consumers use the same function and can persist event
  start strings; this patch does not rewrite historical Firestore event times.
- Prayer/Azaan settings and native notification IDs are cached in AsyncStorage.
  Previously selected-city wall times were scheduled using device-local setHours.

## C. Changes

- `src/services/prayerTimes.js`: reuse numeric IANA date/time components for
  offset-at-instant, selected-city calendar date and wall-time-to-instant conversion.
  Invalid/ambiguous/nonexistent times fail closed. Explicit Melbourne state mapping.
- `src/services/reminders.js`: both prayer and Azaan loops use selected-city dates
  and absolute instants rather than device-local dates/setHours. Bump prayer schedule
  calculation version so old stored schedules are replaced on initialization.
  Azaan already rebuilds its enabled schedule when the prayer screen is opened.
- `src/components/HijriCalendarScreen.js`: prayer calculation date and sun marker
  use the selected city's clock, refreshed every 30 seconds and on foreground.
  No redesign, prayer-name change, religious-method change or Firebase change.
- `scripts/test-prayer-timezone.cjs`: historical reproduction, date/zone matrix,
  early-morning transitions, cross-device timezones and failure cases.
- `scripts/test-prayer-reminder-zones.cjs`: mocked iOS/Android native scheduling,
  persisted-settings restart, version invalidation and city-change tests.
- Separately requested event wording: original Single Event / Recurring Event
  descriptions retained; only the new option is named Registration only events.

## D. Timezone handling

Intl's IANA rules determine the offset dynamically; no fixed seasonal offsets,
month rules, platform-specific +1 hour or dependency upgrade. The calculation uses
the existing UTC-noon anchor on the selected civil date (Australian prayers on
the tested transition dates occur after the early-morning change). Notification
conversion checks the offset at the actual instant and round-trips the wall time;
gaps/folds are rejected rather than guessed. Display strings stay local; only
notification APIs receive an absolute Date. Sydney Fajr 2026-10-14 05:00 maps to
2026-10-13T18:00:00.000Z regardless of device timezone.

## E. Automated checks and pending acceptance

18 date/zone assertions include all requested cases:

| Selected zone | Dates | Expected offset hours |
|---|---|---|
| Sydney | 2026-10-03 / 10-04 / 10-14 | 10 / 11 / 11 |
| Sydney | 2027-04-03 / 04-04 | 11 / 10 |
| Melbourne | 2026-10-14 | 11 |
| Brisbane | 2026-10-14 | 10 |
| Perth | 2026-10-14 | 8 |
| Adelaide | 2026-10-14 | 10.5 |
| Darwin | 2026-10-14 | 9.5 |

Tests also check both sides of Sydney's 02:00 spring / 03:00 autumn transition,
missing/invalid Intl, invalid dates, gap/fold rejection, UTC/Perth/Los Angeles/Kolkata
device zones, module reload without network, and mock notification schedules on
both platforms. These are JavaScript/Node tests, not Hermes/device delivery tests.

Physical acceptance before release:

1. Record iOS/Android OS and app version/build, same city/date/settings; compare all
   displayed prayers against the reference above.
2. In a temporary development-only diagnostic capture record platform/device zone,
   selected city/zone/centre coordinates, method, calculation date, raw HH:mm,
   numeric offset, notification UTC instant and final HH:mm. Do not log names,
   precise user GPS, auth tokens or other personal data. No production logging was
   added by this patch; remove any temporary device instrumentation after testing.
3. Test restart, foreground across midnight, cached city catalogue offline, city
   change and a device zone different from selected city. Verify scheduled native
   delivery, not just notification IDs; check both Azaan and normal reminders.
4. Open the prayer panel after upgrade to rebuild any pre-existing Azaan schedule.

## F. Remaining risks

Physical devices and installed-version provenance remain unverified. Intl depends
on the OS/runtime timezone database. If numeric Intl parts are unavailable the
panel declines to calculate instead of silently guessing. Prayer-reminder limits,
permissions, battery restrictions and finite scheduling horizons remain unchanged.
Previously stored event start times and reminders outside the prayer/Azaan paths
are not migrated. Existing generic venue state fallback is not geospatial timezone
lookup for exceptional border locations. No broader release-readiness claim.

## G. Deployment

The change is JavaScript, but this checkout has no direct expo-updates dependency,
configured update URL/runtimeVersion or EAS update channel. Do not assume installed
store builds can receive an OTA. Plan a new native build: TestFlight verification
first, then approved App Store / Google Play release. No Firebase deployment is
required for the prayer correction. New builds remain gated by the wider release
checklist, including production event-registration integration.
