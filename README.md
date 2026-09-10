# Community Events Australia Native

React Native + Expo client for Community Connect Australia, including the Community Events Australia and Community Businesses Australia modules.

This repository is the native replacement for the existing store-distributed PWA wrapper. Production builds must retain the published store identities and use the shared Firebase project. See [the final launch checklist](docs/release/FINAL_LAUNCH_CHECKLIST.md) before creating or submitting an artifact.

## First Run

```powershell
npm ci
npm run check
npm run test:regressions
npm run start
```

Native Firebase, notifications, App Check and livestreaming require a development or store build; Expo Go does not represent the production application.

## Release checks

```powershell
npm run check
npm run test:regressions
npm run check:release
npx expo-doctor
```

Production signing credentials and secrets belong in EAS/Codemagic and the Deployers store accounts, never in this repository.

## Diagnostics

Production native builds use Firebase Crashlytics through a privacy-safe central diagnostics service. Support can correlate reports using the Diagnostic Session ID shown under Profile > Help & Policies. See [docs/CRASH_MONITORING.md](docs/CRASH_MONITORING.md).
