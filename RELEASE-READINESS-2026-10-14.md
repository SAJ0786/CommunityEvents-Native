# Next release readiness — 14 October 2026

**Not yet ready for a test build. No build or production deployment started.**

15 October checkpoint: see COPILOT-HANDOVER.md for the current continuation plan.
Native registration callable-connected screens and bounded discovery/review list
are now coded behind a disabled build gate, including address picker, private
maps/poster, host/attendee confirmations, edits, cancellation, templates and response
management. Not yet device-accepted or deployed. PWA integration remains separate.
Java 21 was found in Android Studio JBR; the isolated Firestore test script passed
with the latest erasure/discovery changes. CLI post-test update check failed; merged
rules/Storage/App Check acceptance remain open. Older blockers below are historical
where superseded here. Prayer timezone and naming checkpoint is in 6f062c4.

Native repository: SAJ0786/CommunityEvents-Native, branch main. This checkout is
the canonical native source; no additional source folder was created.

## Completed code checkpoints

- Required member name/email completion and newest-first admin user lists.
- Notification-channel manifest conflict correction.
- Prayer-time DST calculation and horizontal-strip scroll candidate fixes.
- Admin bulk-share entry restored with role checks.
- Store Update/Later notice, held behind verified public-release metadata.
- Receiving Apple Team D36Y75H5BU and existing production application ID configured.
- Measured Android/iOS safe-area root and modal handling; both bottom menus are
  inside the safe area, in normal layout flow, with no footer shrink. Source/JSX
  checks passed. This does not change installed APKs or prove device acceptance.
- Dynamic-city foundation: validated cached native catalogue, reactive selectors,
  classification, prayer locations, registration and promotion-email candidates.
  Native/GitHub checkpoint ba9dc5f was verified identical. Remaining consumers
  and rollout gates are detailed in CITY-CATALOGUE-2026-10-14.md.
- Registration backend candidate: private coordinates, safe Apple/Google map-link
  helper, poster replacement/removal and access recheck, answer deletion and
  retention policy. These are not yet production-screen integrations.

## Registration deletion decision

Keep answers until the organiser deletes them, **unless the attendee deletes or
cancels their registration first**. Attendee cancellation removes answers and the
question snapshot immediately in the same transaction that releases their seats.
Private venue/poster access is revoked. Only minimal cancellation/retry metadata
remains, never a copy of the submitted form entries.

Organiser deletion of answers alone is deliberately separate from cancelling a
booking: it clears entries but retains the attendee's reserved place. The final UI
must distinguish these actions and require explicit confirmation.

No automatic 30/90-day expiry was selected. Account-deletion and privacy-request
handling, user-facing notices and organiser/attendee UI remain required.

## Gates still open

1. Production registration host/form builder, discovery, approval, attendee/edit/
   cancellation/confirmation and response-management screens in native and PWA.
   Connect private address autocomplete, exact-map display and poster actions;
   keep public cards suburb-only. Inherit dynamic Add Event types.
2. Form-change/re-consent, event-change/cancellation policies, upload rate limits,
   cleanup retries/orphan handling and complete account/privacy deletion lifecycle.
3. Remaining dynamic-city consumers, especially recovered event notifications and
   PWA. Do not activate new cities while an old worker maps them to Sydney.
4. Local vs Australia-wide promotion selection, admin confirmation and consent-
   aware delivery. Preserve immediate-on-approval timing for future-dated offers.
5. Merged production Firestore/Storage rules, App Check and real end-to-end tests;
   review prerequisite functions against current installed versions before deploy.
6. Reconcile release marketing version (local remains 2.0.0), remote build numbers,
   transferred signing/APNs/App Check and final EAS profile. No credentials changed.
7. Physical Android three-button/gesture navigation and keyboard/rotation checks,
   plus iPhone safe-area/scroll/DST/reminder and full registration acceptance.

## Verification and limitation

Native aggregate regressions, member tests, city catalogue/promotion/registration
factory tests, prayer timezone and safe-area tests pass. Native source parse passes
119 files after adding the private-venue helper. All factory data is synthetic;
there are no production emails, bookings or database writes.

The isolated Firestore emulator rerun was blocked: the installed Firebase CLI now
requires Java 21+, while the available project JDK is 17. It did not start or run
the acceptance script. Do not reuse an earlier emulator pass as proof for the new
changes. Restore an appropriate runtime and rerun the isolated suite, then add
Storage/App Check and merged-rule acceptance before rollout.

Git push via Windows credential-manager remains unreliable; the connected GitHub
API was used for the identical reviewed tree, with a lease check and local/remote
SHA verification. Former-deployer repositories remain forbidden destinations.
