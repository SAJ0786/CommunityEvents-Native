# Production polish and sign-in diagnostics — 24 September 2026

## Scope

- Business Directory header capitalization.
- Sign-in module titles are Events / Business Directory, below the existing Community Connect Australia brand.
- Guests cannot use the event-card Niaz Arrangement action (both disabled UI and guarded callback).
- Menu and Profile Share App use one text payload including https://download.communityconnect.siza.info.
- Guest notification bell/routes return to the existing sign-in entry. Anonymous sessions do not subscribe to the header notification feed, and the drawer cannot render for guests. Returning as a guest resets stale member tabs to Home.

## Sign-in diagnostics

Phone-code requests, code confirmation and guest-sign-in failures are explicitly recorded. A local, bounded history keeps the latest 20 failures for up to seven days; it does not require Firebase Authentication or Firestore access. A Share diagnostic report action is shown at the top of the entry screen after an error, accessible even while the keyboard is open.

Reports contain timestamps, operations, SDK error codes, allowlisted backend reasons/service names, HTTP status when available, and current app/build/platform/bundle/Firebase project and app identifiers. They deliberately omit raw error messages, stack traces, request bodies, API keys, phone numbers, OTPs, emails, session tokens and user IDs.

An internal/app-credential/unknown sign-in error triggers a best-effort App Check token request (at most once per minute, no concurrent probes). Successful token values are never recorded. A failed probe captures structured reasons such as API_KEY_SERVICE_BLOCKED which Firebase Auth may otherwise hide behind auth/internal-error. This does not delay the sign-in UI or automatically retry sign-in/SMS.

Production builds also attempt sanitized Crashlytics nonfatal reporting, independently of the Firestore diagnostic register. Debug builds keep the local report without enabling Crashlytics collection. Cloud upload is best effort and cannot be promised if the key, network or Firebase service itself is blocked. The local report remains shareable if persistence fails during the current session; restarting in that situation loses the in-memory report.

## Verification

- `npm.cmd run check`
- `npm.cmd run check:release`
- `node scripts/test-production-polish.cjs` (callback behavior, copy, share link, privacy, local persistence/retention, rate limiting and reporter/storage failures)
- Existing regression scripts were run. The unchanged stream-lifecycle test still fails at `Ended stream must not minimise`, as previously documented in DEPLOYER-HANDOFF.md. The remaining regression scripts pass when run individually.

No signed Android/iOS device test, production build, backend deployment, commit or push was performed. These changes were prepared against local main dfe3751; remote synchronization was unavailable (Git metadata write denied and GitHub connection failed). Reconcile with current Git main and any deployer changes before committing/building. The separate deployer handoff snapshot has not been modified.

## Device acceptance before release

1. On Android and iPhone select each module: verify short welcome titles and capital Directory in the main header.
2. As a guest, open an event: Niaz is disabled; notification bell returns to sign-in with no permission error. Enter as guest again: no protected member tab/drawer reopens.
3. As a member verify Notifications and Niaz still work.
4. Share App from both menu and profile to WhatsApp, Messages and copy-to-clipboard where available: verify the literal download URL is present and opens correctly.
5. In a non-production test environment induce a sign-in failure without weakening production protections. Share the report, verify build/provider/project/app metadata and reason codes, then retry after resolving the fault. Confirm no key, phone, code or token appears in the report. Confirm production nonfatal delivery in Crashlytics separately when network/configuration allows it.
