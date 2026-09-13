# Email layout and drawer review

## Implemented locally

- `backend/functions-business-workflow/email-template.js` is the common email
  shell for directory workflow notifications and support/report/enquiry emails.
- The brand appears above the subject: `Community Connect | Business Directory`.
  App-wide feedback uses `Community Connect`. Imported Events email handlers
  now use `Community Connect | Events` through the identical shared shell.
- Body text is 16px, brand text 20px and the subject heading 22px. Pale outer
  background, rounded white card and teal header follow the existing business
  changes-submitted email. Long identifiers wrap within the card.
- Sender/reply-to addresses, private recipient routing, notification generation
  and delivery retries remain unchanged for the Business Directory. Events
  From, Reply-To and Contact Us now use `support@siza.info`, including the
  follow-up sender-domain request on 13 September. Recipients are preserved.
  Sender display names follow the brand. SMTP sender verification is required
  before deployment; the previous subdomain sender and Gmail fallback are removed.
- Fixed an inherited undefined `EMAIL_REPLY_TO` reference in directory workflow
  delivery to use the existing `SUPPORT_EMAIL`. A mocked execution of the real
  delivery function now checks this envelope path, not just rendered templates.
- All three drawers still share `useMenuDrawerMotion`. Header-scoped movement
  capture now claims downward drags before child Text/Pressable responders.
  Touch-down, ordinary taps, upward/horizontal movement and content scrolling
  are not captured. Spring, distance thresholds and dismissal timing are unchanged.

## Scope still outstanding

- With user approval, the sanitized deployed Events source was imported into
  `backend/functions-events`. Its entry point exposes ten email handlers only.
  No deployment configuration references it. The environment blocked bulk
  retrieval of other deployed source archives; their parity with the recovered
  `sendRemindersNow` snapshot is unverified. See that folder's README before any
  targeted deployment. No `.env` or hardcoded tester-login endpoint was imported.
- Azaan issue: user reports iOS version 2.0.0, build 29. Codemagic increments the
  TestFlight build number independently of Git, so the build's commit or IPA
  is required to inspect the installed bundle. The supplied artifact ZIP contains
  a build log, not an IPA. It confirms build 29 copied both Azaan audio files into
  the app, but does not prove device notification sound settings. The permission-check gap identified
  earlier remains diagnostic-only; no Azaan change is included here.

## Verification

- All regression tests, source parsing and release checks passed.
- Email preview tests rendered synthetic data at 320px, 393px and 800px without
  horizontal overflow; the business report and update previews were visually
  reviewed. Preview generator: `node scripts/test-email-layout.cjs --render`
  (`EMAIL_PREVIEW_BROWSER=msedge` uses an installed Edge browser).
- Header gesture capture, child-tap preservation and existing motion lifecycle
  pass deterministic tests. This does not verify native iPhone touch dispatch.
- Test on device: drag down from both the handle and title; verify short-drag
  snap-back, full dismissal, Close button, notification clearing, content scroll,
  and event action overlays. Menu should retain its current behaviour.
- No production emails were sent, no function was deployed and no code was
  pushed as part of this review. Backend deployment is needed for email changes;
  a new app build is needed for the header gesture change.
