# Native testing review — 18 October 2026

Started from native Git main `fd88ef6`, after fetching and fast-forwarding 19 incoming commits. The two pre-existing local documentation edits and untracked context file were backed up under this chat's work/pre-sync directory. The unrelated context file remains untracked; it was not included in the changes.

All changes below are source changes requiring a new native build/device retest. No cloud deployment, app build, or store publication was performed.

| Item | Review and change |
|---|---|
| 1 | Removed duplicate profile reads and the extra blocking post-SMS profile initialization. Private profiles still require verified authentication; no unauthenticated phone/account lookup was introduced. This intentionally differs from checking a private profile immediately on number entry. |
| 2 | Completed members can enter from Firestore's existing device cache while authoritative account data refreshes. Token refresh for the same UID no longer resets the gate. Incomplete profiles still require name/email; legacy migration no longer holds the completion screen behind it. |
| 3 | Explicit two-line Registration/only label with a consistent label height. |
| 4 | Event details render as soon as authorized data arrives; private poster transfer no longer blocks the whole card. |
| 5 | Responses initially show participant names; tapping a name expands that response. |
| 6 | Removed internal booking ID heading and the technical introductory response text. |
| 7 | Real .xlsx attachment, all response pages, one participant per row, question columns, numeric places, column widths, filters and literal text answers. Temporary export is deleted after sharing. |
| 8 | Detail/response requests run concurrently; event discovery checks run in bounded groups of five while preserving the authorization policy and ordering. Slow-image and response-expansion interaction tests added. No device latency benchmark is claimed. |
| 9 | Bulk Share city selector starts at the user's default city and filters that city's events. Changing city clears selection. Private-event sharing respects the administrator's city scope. |
| 10 | Bulk Share attaches the existing Community Connect poster and ends with the requested download sentence and link. Receiving apps control how image/caption/link previews display; WhatsApp/iOS/Android retest remains necessary. |
| 11 | Device event notes say Community Connect - Events. Web subscription feed name is Community Connect Australia; normal/registration feed descriptions carry the new label. Backend deployment is still required. Existing subscriptions may retain their chosen calendar name until refreshed/re-added. |
| 12 | Removed the misplaced registration approval queue from Users. |
| 13 | Users entry resets all filters consistently. Already-loaded rows stay visible instead of being hidden by a redundant refresh. Successful loads alone mark the list as loaded. Original device-only symptom still needs retest. |
| 14 | Admin Events has Events and Registration only Events tabs; the registration review queue is on its relevant tab. |
| 15 | Registration event details use a native modal outside the scrolling admin list, with a defined sheet height. |
| 16 | Normal event details use the same modal fix; parent clipping can no longer contain the backdrop/sheet. Existing inline share/reminder/message panels remain inside that modal. |
| 17 | Removed duplicate Back to events controls and the nested event header; registration title belongs inside the shared event form. Removed nested vertical form scrolling. |
| 18 | Registration event start/end fields now open the existing native time selector; clearing times and overnight/date-only behavior are retained. |
| 19 | Compared the current web editor. Native retains shared organiser, host/contact, Gregorian/Hijri date, event city/time, address/suburb, type, subject, audience, speaker/reciters and notes fields, plus private poster, capacity, closing, cancellation, recurrence and form settings. Existing Git code had already supplied most fields. |
| 20 | Form question move-up/down/delete are accessible icon buttons. |
| 21 | Review has styled Approve, Reject and Suggest changes controls. New superadmin-only, revision-checked review callable records private feedback. Rejected/submitted changes retain their draft and never replace the published event. Editing/saving resubmits for review. Backend deployment is required before those new actions can run. |
| 22 | Review data is presented in styled labeled panels with readable labels; raw metadata keys and coordinate dumps removed. Review has proper modal safe-area handling. |

## Verification

- Native source/configuration check passed.
- Registration backend: 46 tests passed, including review permissions, stale revisions, private feedback and resubmission.
- Registration integration: 37 tests passed, including slow-poster rendering, name expansion, private-data access, approvals, recurrence and retries.
- Schedule: 6 tests passed; recurrence: 5 tests passed.
- Member registration and Excel/profile service checks passed. The generated workbook was read back with SheetJS; formula-looking user input remained literal text.
- Full native regression script passed (picker/business approval, event actions, streaming, messaging, drawer motion, support, admin layout, headers, typography, email and community images).
- Web production build/unified-source check passed. Full web tests: 281 passed, 2 existing failures in tests/registration-prototype.test.mjs comparing web prototype contracts with the sibling native contracts. These model files and tests were unchanged by this work; their existing public metadata projection differences remain. Calendar-specific tests passed.
- Git whitespace checks passed.

## Release follow-up

Deploy the registration backend (including reviewRegistrationEvent) and web calendar-feed changes together with an approved native release. Retest the 22 items on installed iOS and Android builds, including a previously incomplete member, an already-complete returning member, admin cards/approval, Excel sharing and WhatsApp image/caption delivery. This work does not claim live deployment or physical-device verification.
