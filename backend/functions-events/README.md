# Recovered Events email source — local review only

Imported with user approval on 2026-09-13 after checking the available local
native-app repositories. No existing Events backend source was found there.

## Provenance and limits

`recovered-source.js` originates from the deployed `sendRemindersNow` archive:

- Project: `community-event-8b639`
- Region: `australia-southeast1`
- Object: `gs://gcf-v2-sources-209723097611-australia-southeast1/sendRemindersNow/function-source.zip#1786334124438795`
- Function update: `2026-08-10T03:55:38.273841548Z`
- Downloaded archive SHA-256: `72cc7d1b3d53f6ce134eda825cf4a7567f2b90a419d010138b8160180983d11e`

The archive contained a monolithic backend with many function definitions.
This is a sanitized, modified recovery, not a byte-identical backup. Line endings
were normalized. Deployed metadata for the ten email handlers is recorded in
`source-provenance.json`. Their source object generations differ: **only the
sendRemindersNow archive was retrieved and inspected**. The environment blocked
bulk retrieval of the other archives because they may contain production secrets
and unrelated code. Their implementation parity remains unverified.

## Excluded from import

- `.env` and its secret values; no production credentials are needed for tests.
- The legacy hardcoded tester-login endpoint in the original source.
- An unused duplicate `functions.js`, package backups, and unrelated streaming
  thumbnail binary. The deep-stories HTML used by reminder emails is retained.

Non-email definitions remain in the recovered monolith for review, but the
package's `email-entrypoints.js` exposes only the ten email-related handlers.
It does not expose account management, streaming management or tester login.
This is not a security audit of the inherited backend. Do not restore the
excluded endpoint; review any legacy test account separately before launch.

## Email changes

- All seven SMTP send sites use `sendEventEmail`; its shared card has a 20px
  brand, 22px subject and 16px body, matching the Business Directory shell.
- Brand: `Community Connect | Events`; From, Reply-To and Contact Us use
  `support@siza.info`, as requested after the 13 September email screenshot.
  The old reminder/update/admin sender addresses and Gmail fallback are removed.
  Verify the support address/domain with the actual SMTP provider before deploying;
  the local change does not establish sender verification or deliverability.
- Existing subjects, recipients, secret names,
  authentication checks, schedules and trigger paths are retained.
- Event details use narrow-screen cards instead of a seven-column table.
- The verification code remains on one line on small screens.
- `email-template.js` intentionally duplicates the Business Directory helper
  because Firebase source packages deploy independently. Tests enforce equality.

The AI-content report's existing Gmail **recipient** was not rerouted by this
formatting change. Confirm its intended destination separately; Reply-To is not
the delivery recipient.

## Deployment safety

**No Firebase deployment configuration points to this directory.** Do not add it
as a new codebase or run a broad deployment: these function names already exist.
Before deployment, verify the individual live source revisions through approved
access, reconcile their changes, review inherited security-sensitive handlers,
and plan a targeted update under the existing function ownership/codebase. Preserve
the separate deployed unsubscribe endpoint used by email links.

Nothing here changes app signing, bundle IDs, Firebase data or production emails.
Dependencies/lockfile were retained from the archive; a real dependency install
and deployment-runtime check remain necessary before release.

## Local verification

From the native-app repository root:

```powershell
node scripts/test-events-email.cjs
node scripts/test-email-layout.cjs
$env:EMAIL_PREVIEW_BROWSER = 'msedge'
node scripts/test-email-layout.cjs --render
```

Tests mock Firebase and SMTP, use synthetic identities, and never send mail or
write to a live database. Previews are generated under ignored `.tools/`.
