# Member registration and admin ordering — prepared, not released

## Working copy and scope

This isolated local copy is based on native commit `435f6ecd452aeff5a373929d3b219b7f8dfd06b4`. Windows ACLs prevented editing `sdk51-package-backup`, even after a write-permission approval. The original native checkout is unchanged, including its pre-existing Android manifest modification. The web project is unchanged by this task.

The accompanying patch contains only this task's changes and should be reviewed/applied to the original native checkout before the next release. This copy is not a replacement release checkout: ignored build/configuration files and the original uncommitted manifest change were not cloned.

No backend, security rule, live record, store submission or native binary was changed/released.

## Behaviour

- Both iOS and Android share the same profile-completion gate after authentication, including Android automatic phone verification and restored sessions.
- Registered members must have a valid full name and contact email. Incomplete existing profiles are prompted too. Guests can still browse without providing either.
- An authenticated profile that cannot be loaded stays on Retry/Sign out; it cannot silently bypass completion. Inactive profiles are blocked. Old non-phone sessions must sign out and verify their mobile.
- Verified phone comes from Firebase Auth on the server, not editable form input. Email is a validated contact address, **not email-verified identity**. No email-based account linking or role changes are performed by the new completion endpoint.
- Save failures retain the form and show an error. The gate only opens once the saved profile is read successfully. Existing roles, city settings and saved items are preserved.
- New native UI colours use the existing central theme, including an `onPrimary` text token.
- Both Events and Business Directory admin lists sort by joining date descending. Shared handling supports Firestore timestamps, serialized seconds and legacy date strings; invalid/missing dates sort last, with stable ID tie-breaking.
- Both admin lists show name, email and phone separately. Events no longer labels an unset city as Sydney. Its CSV uses the same date semantics and missing-city display.

## Backend prerequisites — deploy before distributing the new app

Prepared in `backend/functions-lifecycle`:

1. `completeMemberRegistration`: authenticated, non-anonymous callable. Server validates name/email, current policy consent, active account and verified Australian mobile; merges only permitted fields into the caller's own profile in a transaction.
2. `recordMemberRegistrationDate`: idempotent document-create trigger. Sets `registeredAt` from Firestore document `createTime`. A completion call also fills this field on an older incomplete profile from its original document creation time, never from today's completion time.
3. `backend/firestore.rules`: protects `registeredAt`, `profileCompletedAt` and server `legalAcceptedAt` from ordinary client edits. The profile create allowlist stays backward-compatible with existing released apps.

The joining date is the creation time of the current member profile document. It does not reconstruct a possibly older deleted/migrated account's original history. Existing profiles that already have historical date fields retain those fields; other old profiles without dates remain visibly unknown until authoritative recovery. There is no bulk backfill or live-data modification in this task.

Deploy only the two named functions using `backend/firebase.lifecycle.json`, and separately the reviewed Firestore rules using `backend/firebase.json`. Do not deploy the entire default functions codebase or unrelated services as a shortcut. Verify the target project and current deployed rules first. Release authorization is still required.

**Do not distribute the new app before the callable is deployed and tested:** incomplete members would otherwise be unable to complete registration. Older binaries remain able to create incomplete profiles until updated; this client gate is not a blanket backend denial of all older clients.

## Verification

- `npm run test:registration`: passes. Covers gate states, form validation/consent, keyboard-oriented native controls, save-busy state, retry/blocked screens, server authorization, untrusted payload fields, role/preference preservation, dates, idempotent trigger and newest-first ordering. These are mocked/local tests, not device or emulator acceptance.
- `npm run check`: passes, including parsing 109 JavaScript files and existing source contracts.
- 13 existing regression scripts pass when run individually.
- The aggregate regression run stops at the pre-existing `test-stream-lifecycle.cjs` failure: `Ended stream must not minimise`. The identical failure was reproduced in the untouched original checkout. No streaming code was changed.
- Backend JavaScript syntax checks and `git diff --check` pass.
- No SMS, real login, deployment, account creation or paid build was performed. No native screenshots/device rendering or Firebase emulator rules tests were performed.

Local tests in this isolated copy reused the original checkout's installed Node dependencies via `NODE_PATH`; no dependency installation or original `node_modules` mutation was performed.

## Release acceptance checklist

- Apply/check patch against original source, preserving unrelated changes; review full diff.
- Validate the two new functions and timestamp field rules in an emulator/staging environment, including guest/other-user rejection and timestamp tampering.
- Verify physical iOS/Android new OTP and Android automatic verification paths.
- Verify missing-name, missing-email, invalid-email and failed-save cases cannot enter member features; consent required; retry retains fields.
- Verify existing complete users, admins, incomplete users, sign-out, app restart, slow/offline profile reads and guest browsing.
- Verify new member appears at top of both admin lists; missing dates remain last; filtering preserves ordering; dates/contacts/city labels agree.
- Verify keyboard scrolling, large text and small screens. Build new iOS/Android binaries only after backend acceptance and release approval.
