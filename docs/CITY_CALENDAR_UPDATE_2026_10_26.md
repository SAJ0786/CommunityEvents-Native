# Required city and secure calendar update

26 October 2026. Implementation and release record; deployment details are appended after verification.

## Changes

- Native and web share the same entry decision: a verified signed-in member with complete contact details but no saved defaultCity must complete a city-only screen before entering either module. New profiles explicitly choose a city with name, email and policy acceptance. There is no preselected city and dismissing the picker does not satisfy the gate. Existing names, roles, legal acceptance and registration dates are preserved by city-only completion. Guests remain a separate unauthenticated browsing path.
- completeMemberRegistration validates and saves the selected city on the server. completeMemberCity is an authenticated, phone-verified, active-member callable that fills a missing city without permitting onboarding to change an existing city or alter account authority. Current production ownership of these functions is community-connect-web; use the web prepared package, not a broad lifecycle redeployment.
- Home browsing city remains separate from saved profile city. Calendar feeds read the saved city at each refresh; changing the default city replaces city content on subsequent successful calendar-provider refreshes. Existing previously-polled UID subscriptions remain accepted. They are not revoked or redirected.
- New native/web subscription screens request random 256-bit secret links from createCalendarSubscription. Only the token hash is stored server-side. New subscribers are not granted UID-feed access. Issuance is bounded to ten per account/hour. Feed requests recheck active account, subscription, token and city; reads never reactivate subscriptions.
- Feeds omit hidden/deleted/unavailable events, exact private addresses, contacts, participant answers, poster paths and free-form notes. They include title, date/time, suburb and card-first links. Dates use city timezones; a missing end time no longer generates an equal start/end pair. Missing-city or revoked access returns a valid empty calendar; transient failures return 503 so providers can retry without interpreting an outage as deletion.
- The Home update notice already existed, but no appReleases documents existed and its read rule was missing. The prepared rules add only public single-document reads for ios/android release metadata, with client writes/listing denied. The notice now compares numeric build numbers when the marketing version is unchanged. Actual store availability must be verified before publishing metadata.
- Web root rules now match the protected canonical native baseline plus the release-read rule, removing the known risk of redeploying permissive profile/image rules. Ordinary-event private-data separation is a separate migration and is not claimed complete here.

## Validation

322 web unit cases passed, including 13 new calendar-feed security/lifecycle cases. Native member completion suite, three new required-city server cases, eight store-update cases, source/release and admin-layout checks passed. Browser checks at phone and desktop widths verified picker dismissal cannot skip selection, failed saves do not enter the app and successful saves do. Production web build and runtime checks are recorded with deployment results.

## Compatibility and limits

Firebase phone verification necessarily occurs before saving the authenticated member profile. The entry gate prevents access to member modules until city completion; a phone Auth record or unfinished profile may still appear in administration. It is not proof of a completed member session.

OTA-enabled compatible binaries can receive these JavaScript changes. A client that predates the gate and cannot receive the OTA cannot be retroactively forced to run it. A mandatory minimum-version policy needs supported client code and a coordinated server compatibility policy; it is not silently enabled in this release. No forced logout, bulk email/push, speculative city assignment or new native binary is authorised merely by this implementation.

Calendar providers control polling. Server updates do not guarantee immediate removal from Apple/Google/Outlook or erase separately copied events. A previously used legacy URL remains a bearer credential tied to a UID and now exposes only a city-scoped limited projection. New links use independent secrets. Current callers creating a subscription opt in; the code does not send any message or modify a person's actual phone calendar.
