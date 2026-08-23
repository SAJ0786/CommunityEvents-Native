# Crash Monitoring

Community Events Australia uses Firebase Crashlytics through a central diagnostics service in `src/services/diagnostics`. Production builds collect native and JavaScript failures; development collection is disabled by default to avoid test noise.

## Architecture

- `index.js` initializes Crashlytics, creates a privacy-safe session ID, records breadcrumbs, screen context, build metadata and Firebase UID.
- `sanitizeError.js` removes tokens, credentials, secrets, cookies, API keys and oversized payloads.
- `AppErrorBoundary.js` records React rendering failures and gives users a recoverable fallback.
- Feature code should call `logDiagnostic`, `setDiagnosticContext` and `recordNonFatalError`; it must not call Crashlytics directly.

Never log passwords, verification codes, private messages, access/refresh tokens, API keys, authorization headers, private event codes or complete Firestore documents.

## Android and iOS setup

The Expo config includes the React Native Firebase App, Auth and Crashlytics plugins. Android uses `google-services.json`; iOS uses `GoogleService-Info.plist`. Run Expo prebuild after changing a native Firebase package. Release builds upload Android mapping information and iOS symbols through the configured Firebase build plugins.

## Session IDs and support

Every launch creates an ID such as `CCA-20260819-A1B2C3`. It is attached to reports and displayed with a copy button under Profile > Help & Policies. Ask a user for this ID when investigating a problem.

## Adding feature diagnostics

```js
try {
  await operation();
} catch (error) {
  recordNonFatalError(error, { feature: 'calendar_sync', operation: 'add_event', event_id: event.id });
  throw error;
}
```

Use IDs rather than event or business names. Breadcrumbs should describe significant workflow transitions, not every tap.

## Verification checklist

1. Use a controlled non-fatal test and confirm version, build, device, screen, feature and session ID in Crashlytics.
2. Test a deliberate native fatal crash only in an internal test build.
3. Confirm authenticated reports use Firebase UID and signed-out reports use the anonymous session.
4. Inspect reports for secrets and personal content.
5. Generate an offline test error, reconnect and confirm upload.
6. Confirm release stack traces are readable.

Configure Firebase Console alerts for new fatal issues, regressions, reopened issues and high-impact crashes. Keep alert recipients and thresholds in Firebase project administration rather than source control.

