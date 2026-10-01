# Local promotion approval emails

Prepared 2 October 2026. The user authorised pushing native changes and deploying the functions needed for promotion email now, without making an app build. Other release deployments remain deferred.

## Behaviour

- Email immediately when a promotion changes from a non-active status to `active`, including future-start offers. State both dates and warn that the offer may not yet be available.
- Match the approved, visible business's city to each active member's `defaultCity`. Missing/unknown cities are excluded, not assumed to be Sydney. No Australia-wide broadcast in this increment.
- Require a valid email and both `emailNotificationsEnabled === true` and `businessNotificationsEnabled === true`. Missing preferences, inactive/deleted/banned/archived/migrated profiles are excluded. This uses existing preferences; it does not establish or backfill consent.
- Reject hidden, unapproved, invalid-date and expired promotions. Recheck eligibility, email, preferences, business city and approval revision just before attempting delivery.
- One campaign per promotion ID, recipient IDs derived from normalised email hashes, paginated user reads (100 per page), persistent cursor and transactional job claiming.
- No broadcast on active edits, repeated approval events or re-approval of an already-campaigned promotion. A promotion withdrawn/reapproved before delivery is skipped; no replacement campaign is generated automatically.
- Deployment does not enumerate historical promotions. Only subsequent approval transitions can create campaigns. Do not approve/reapprove real offers as a deployment test.
- Emails use the existing SMTP secrets, Community Connect branded template and app download URL. HTML is escaped. Footer includes existing preference opt-out instructions and a reply-to-support unsubscribe option. Support must action unsubscribe replies before future marketing sends; this is not an automatic unsubscribe endpoint.
- Existing owner/admin approval emails, in-app notifications and push behaviour are unchanged. This increment is member **email only**. Nationwide controls and additional member push/in-app announcements remain future work.
- No iOS/Android rebuild is needed for these two server functions; the manifest fix in this commit only takes effect in a later Android build.

## Verification and delivery semantics

Run `npm run test:promotion-email` (offline, synthetic recipients and fake SMTP). It exercises the actual handlers, not a separate copy of their logic: explicit preferences, city matching, future/expired offers, local timezone expiry, paging/resume, duplicate emails, concurrent delivery/replay, opt-outs/withdrawals, escaping, and ambiguous SMTP/writeback failures.

Also run existing registration, email layout and business notification regression scripts. The existing unrelated streaming regression failure is not fixed by this change. Offline tests do not establish successful production deployment or inbox delivery.

Private server records:

- `promotionEmailCampaigns/{promotionId}`: approval snapshot, city, cursor, `queueing`/`queued` (enumeration complete, not all email delivered).
- `promotionEmailCampaigns/{promotionId}/recipients/{emailHash}`: UID/hash and delivery state; no duplicate plaintext email list.
- `pending`: safe to retry before claim; `sending`: SMTP might have been attempted; `accepted`: SMTP accepted, not proof of inbox delivery; `skipped`: eligibility changed; `review-required`: ambiguous/error result.

SMTP is not transactional with Firestore. After a job enters `sending`, it is deliberately never automatically resent, even after a crash. This prioritises avoiding duplicate marketing emails over guaranteed delivery. Operators must reconcile `sending` and `review-required` with SMTP logs; never blindly reset or replay them. Monitor SMTP quota/bounces and support unsubscribe requests. The worker is capped at five instances with one concurrent invocation per instance.

## Narrow deployment runbook

Production project: `community-event-8b639`; region: `australia-southeast1`; codebase: `business-workflow`.

The Codex session could load the backend source and run offline tests, but Windows denied access to the installed Firebase CLI even after a read-permission request. **Deployment has not been performed by this preparation.** Use an authorised, normally signed-in PC shell. Never paste credentials into chat.

1. Review this native commit and confirm the signed-in Firebase project/account. Inspect `firebase functions:list --project community-event-8b639`. Verify the live rules do not grant clients access to the new campaign collection/subcollections. The checked-in rules have no matching client grants; no rules deployment is included here.
2. Install existing locked backend dependencies in this source copy if needed: `npm ci --prefix backend/functions-business-workflow`. Run the offline tests. Do not run an app build.
3. Deploy the delivery worker **first** and confirm it succeeds before deploying the approval queue. This avoids creating jobs before the worker's create trigger exists. Commands below use exact named-function filters, never the whole codebase. Existing SMTP secrets must already be available; do not rotate them for this change.

```powershell
Set-Location "C:\Users\sajja\Documents\Codex\2026-08-10\this-chat-is-for-community-events\member-registration-fix"
npm.cmd ci --prefix backend/functions-business-workflow
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed" }
node --test scripts/test-promotion-email.cjs
if ($LASTEXITCODE -ne 0) { throw "Promotion email tests failed" }
firebase.cmd deploy --config backend/firebase.json --project community-event-8b639 --only functions:business-workflow:deliverApprovedPromotionEmail
if ($LASTEXITCODE -ne 0) { throw "Delivery worker deployment failed; do not deploy the queue" }
firebase.cmd deploy --config backend/firebase.json --project community-event-8b639 --only functions:business-workflow:queueApprovedPromotionEmails
if ($LASTEXITCODE -ne 0) { throw "Approval queue deployment failed" }
firebase.cmd functions:list --project community-event-8b639
```

4. Verify both named functions are active in the correct region, and check errors after the next genuine approval. Record deployed revisions and outcomes. Do not send to all real members as a smoke test; a synthetic end-to-end test should use an approved staging project.
5. If only the delivery worker deploys, no new campaigns are produced; resolve the queue deployment later. Do not call that partial state a released feature.

Partial deployment syntax is documented in the [Firebase CLI source/help](https://github.com/firebase/firebase-tools/blob/main/src/commands/deploy.ts) and [Firebase CLI deployment documentation](https://firebase.google.com/docs/cli#partial_deploys).

Do not deploy Hosting, Firestore/Storage rules, registration/lifecycle functions, Events functions or unrelated business-workflow exports with these commands. Do not run broad `firebase deploy`, `--only functions`, or `--only functions:business-workflow`.

## Rollback / stopping new emails

With release-operator approval, remove only the newly added delivery function first, then the newly added queue function using Firebase's named-function deletion in this project/region. In-flight SMTP sends may still complete and already-sent emails cannot be recalled. Do not delete the receipt/campaign records. After a stop, review pending/ambiguous jobs before re-enabling; recreated Firestore create triggers do not provide a safe automatic replay plan. No existing functions or installed apps need to be reverted.

## Deferred work

Registration functions/rules and new native binaries remain deferred. Android system-navigation overlap still needs device diagnostics and a safe-area layout fix. Australia-wide audience selection/admin confirmation and member promotional push/in-app announcements are not implemented by this commit. Separate web work is excluded.
