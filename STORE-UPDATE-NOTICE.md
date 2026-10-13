# Store update notice — release candidate, not deployed

13 October read-only Australian App Store lookup confirmed ID 6782770347, bundle info.siza.communityevents, name Community Connect Australia, public version 2.1.0. Production EAS submission retains that verified app ID and uses receiving Team D36Y75H5BU. This does not verify membership/signing credentials. Local 2.0.0 version must be corrected before the eventual build.

The Events and Business Directory Home screens display a theme-token-based notice with Update and Later actions. Installed native marketing version is compared numerically with an operator-verified public store version. Build numbers and TestFlight uploads alone do not trigger a notice. Current/newer apps, development previews, personal-test bundle IDs, malformed/offline/missing configuration stay quiet. Later snoozes that platform/version for 24 hours; a newer release gets its own snooze key.

Checks run on Home entry and foreground, throttled to six hours (five minutes after errors), with an eight-second timeout. Remote URLs are ignored; the existing storeLinks constants supply the official production listing. Firestore is read server-only to avoid persistent stale notices after withdrawal. In-memory metadata may remain visible for up to six hours after a remote disable; expiry is checked at every Home/foreground check.

## Release operator procedure (do not run before store availability)

1. Verify transferred production app identity, receiving Apple Team D36Y75H5BU, signing, Firebase App Check/APNs, current store version and the existing storeLinks listing IDs. Team configuration is not evidence of valid credentials.
2. Finish all agreed features, backend compatibility and device testing. TestFlight is first; Android remains a later release. Reconcile currently stale 2.0.0 local version/release-check baseline with the actual store version before building.
3. Review/deploy only the additive appReleases rule with the agreed release ruleset; do not deploy the entire pending rules file blindly. Public GET for ios/android only; all client writes and lists denied. Verify this using the merged rules emulator before production deployment.
4. After independently verifying the version is publicly installable in the Australian store (not just TestFlight/closed testing, review approval, scheduled publication or a limited Android rollout), a trusted operator uses the Admin SDK/Firebase console to write appReleases/ios or appReleases/android. Never include credentials or personal data; these records are public. Use only the matching platform so iOS rollout does not announce Android early.

Example schema (illustrative; not a live release announcement):

```json
{
  "enabled": false,
  "storeVerified": false,
  "applicationId": "info.siza.communityevents",
  "version": "2.2.0",
  "publishedAt": "2026-11-01T00:00:00Z",
  "expiresAt": "2026-12-01T00:00:00Z"
}
```

Use the actual verified version and UTC dates, then enable and mark verified. For Android use applicationId info.siza.communityevents.app. Set enabled false to withdraw. Keep dates maintained; expired records stop prompting. This is a controlled announcement feed, not automatic App Store/Play scraping or an automatic release publisher.

## Acceptance still required

- Emulator rules check: anonymous/public GET only for two allowed docs; authenticated admins/users cannot publish from clients.
- On iPhone/TestFlight and later Android: synthetic newer/equal/older configuration, both Home screens, text scaling, offline, foreground, Later/restart and correct store opening. Use isolated test configuration, not a fake live release.
- Confirm registered user workflows and maps/prayer/notifications unaffected. Already installed older binaries cannot display this new notice until updated once.

Local tests: node --test scripts/test-store-update.cjs. No functions, rules, metadata or store releases were deployed by this implementation.
