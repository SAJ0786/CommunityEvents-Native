# Community Events Australia Native

React Native + Expo client for Community Events Australia.

This app is intentionally separate from the existing PWA. It uses the same Firebase backend and starts with a read-only native Home screen so we can validate the mobile architecture before adding login, event creation, admin, push, and livestreaming.

## First Run

```powershell
cd "C:\Users\sajja\OneDrive - SIZA Family\1. Professional\AI Apps\Community Event\2. Mobile App - React Native Expo"
npm install
npm run start
```

Use Expo Go for the first read-only test. Later native features such as push notifications and livestreaming will require an Expo development build.

## Diagnostics

Production native builds use Firebase Crashlytics through a privacy-safe central diagnostics service. Support can correlate reports using the Diagnostic Session ID shown under Profile > Help & Policies. See [docs/CRASH_MONITORING.md](docs/CRASH_MONITORING.md).
