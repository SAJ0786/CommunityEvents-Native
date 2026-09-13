# Messaging and feedback handoff — 13 September 2026

## Approved routing

| Entry point | Recipient / destination | In-app record |
| --- | --- | --- |
| Event Contact Host (including event feedback) | Current event host and sender only; no admin fallback or email copy | Host Inbox |
| Business Contact | Current business owner and sender; email copy to the business's recorded contact.email | Business Inbox |
| Profile: Feedback & Report a Problem | support@siza.info | No feedback inbox |
| Business details: Report a Problem | Business-city admins and all active super admins, individually emailed; support fallback if no valid admin address | No feedback inbox |

Transfers affect new contacts. Existing conversations remain with their original participants; participants cannot replace the identity/membership fields. A super admin has no special right to read a private host/business conversation. Old customer messages are not emailed to a replacement business owner.

Profile form categories: App feedback / suggestion, Technical problem, Account / login issue, Privacy enquiry, Other.
Business report categories: Incorrect information, Misleading or unsafe conduct, Suspected fraud or impersonation, Inappropriate content, Business closed, Other.

Reports contain a reference, business name/id/city where relevant, reporter name/email, category, date and message. Client-supplied city/recipient fields cannot control delivery. Emails are escaped, with support@siza.info as From and Reply-To. Profile/provided emails are not represented as verified Firebase email addresses.

## Backend

New functions in the business-workflow codebase, australia-southeast1:
- submitSupportRequest: validates an authenticated or anonymous app session, fields and category; 30-second per-session rate limit; idempotent client reference.
- queueBusinessEnquiryEmail: queues customer message copies, only to the official recorded business email and only while the original owner still matches.
- deliverSupportEmail: delivery lease, individual recipient receipts and up to five attempts. Event retries skip already completed recipients. SMTP acceptance is not a guarantee of inbox placement; transport ambiguities can still cause duplicates.

Private server-only collections: supportSubmissions, supportSubmissionLimits, supportEmailOutbox (with deliveries subcollection). No automatic deletion or retention timer was added.

The inbox array-contains queries failed in the Firestore emulator with the previous list-type/hasAny participant predicate. The query-compatible authenticated UID membership predicate passes the same tests without granting admin read access. Host identity fields are also immutable on updates.

Live rules published: 9f24cada-2d12-47fe-a520-6e35052e8ce5.
Rollback ruleset retained: cca28dde-86b0-498c-a766-666d2a372947.
The publisher modifies only the two participant helpers, host update restrictions and three private support collection rules, preserving unrelated live rules.

## One-off approved test-data cleanup

Removed 4 adminFeedbackThreads and 12 child documents (16 total), using update-time preconditions and one atomic commit. No host/business conversations, users or notifications were removed.

Recovery snapshot is outside Git:
.tools/feedback-backups/test-feedback-2026-09-13T03-10-26-200Z.json

The backup includes full Firestore document representations and paths. An administrator can restore their fields to the original paths using the Admin SDK/Firestore REST API; original Firestore createTime/updateTime cannot be restored. The cleanup script has a completion marker and an expiry guard. Do not reuse it after launch.

## Verification and build handoff

Run npm run check, npm run test:regressions and npm run check:release.
For synthetic Firestore privacy tests, start firebase-tools emulators:start --only firestore --project demo-community-support --config backend/firebase.emulator.json, then npm run test:inbox-rules. These tests use only localhost and the demo project, never production data.

Menu, event-details and notification drawers share useMenuDrawerMotion. Swipe from the dedicated handle/header; body content remains independently scrollable. No changes were made to nested Share/contact/reminder dialogs.

Prepare a fresh Android/iOS build from main for the new forms/drawer behavior. Signing, store bundle/application IDs, release version baseline and credentials are unchanged. Before launch, verify on a device:

1. Sender sends Contact Host; host can read/reply; unrelated admin cannot see it.
2. Contact Business appears for sender/owner, and the official business mailbox receives a copy.
3. Profile feedback sends to support; business-page report sends to city/super admins, not automatically to owner.
4. After transfer, new contacts go to the new owner; old conversations remain private to the original participants.
5. Menu, notification and event-details header swipes close smoothly; scrolling and keyboard entry remain usable.

No actual support emails were sent by the unit tests. Device gestures and real mailbox receipt require the fresh-build smoke check; a backend deployment is not an iOS/Android store-build test.
