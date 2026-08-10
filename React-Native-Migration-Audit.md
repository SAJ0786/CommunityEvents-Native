# Community Events Australia - React Native + Expo Migration Audit

Date: 9 August 2026
Source PWA: `C:\Users\sajja\OneDrive - SIZA Family\1. Professional\AI Apps\Community Event\App`
Target mobile folder: `C:\Users\sajja\OneDrive - SIZA Family\1. Professional\AI Apps\Community Event\2. Mobile App - React Native Expo`

## Objective

Build a true native iOS and Android app using React Native + Expo while keeping the current React PWA running independently. The mobile app should use the same Firebase project, Firestore data, Cloud Functions, Storage, roles, privacy rules, event workflows, livestream metadata, reminders, Hijri logic, and admin rules wherever technically possible.

This audit is intentionally conservative: rebuild only the platform/UI layer where React Native requires it, and reuse existing business logic where it is already platform-neutral.

## Repository Architecture Summary

The current app is a Vite + React PWA backed by Firebase.

- Frontend: React 18, Vite, plain CSS, lucide-react icons.
- Backend: Firebase Auth, Firestore, Storage, Cloud Functions v2, scheduled functions, callable functions, SES/Gmail email logic, YouTube OAuth/live functions, calendar feed, push notification backend.
- PWA-specific runtime: service worker, Firebase Messaging web service worker, web offline cache, install/update behavior, browser APIs.
- Current Android native wrapper: exists under `android-native-wrapper`, but it is a separate wrapper/bridge implementation and should not become the foundation for the new React Native app.

Important frontend areas:

- `src/App.jsx`: web app shell, routing, auth state, PWA update/offline handling, default city prompt, notification wiring.
- `src/pages`: route screens such as Home, Auth, Add Event, Recurring Event, Calendar, Profile, Admin Dashboard, Hijri Calendar, Streamed Videos, Bulk Share, AI Search.
- `src/components`: EventCard, EventForm, EventFilters, EventMapView, LiveStream, PreCheckCard, Header, BottomNav, Walkthrough, ShareSheet.
- `src/services`: Firestore services, date/Hijri/prayer/recurrence logic, notification, native stream bridge, image service, Maps/geo, organisations, YouTube service.
- `src/utils`: roles, permissions, cities, constants, store links.
- `functions/index.js`: production Cloud Functions, including email reminders, push reminders, admin workflows, AI reports, YouTube livestreaming, native stream start/stop, SES webhook, calendar feed, public events.

## Reusable Modules

These can be reused mostly unchanged or with small platform-neutral extraction.

| Module | Reuse Level | Notes |
|---|---:|---|
| Firebase project/backend | High | Keep same Firebase project, Firestore collections, Storage buckets, Cloud Functions, security rules. |
| Cloud Functions | High | Callable and scheduled functions remain backend API for both PWA and mobile app. |
| Firestore data model | High | Keep `events`, `users`, organisations, livestream records, Hijri settings, AI reports, email feedback collections. |
| `src/utils/cities.js` | High | Pure JS city/default-city classification. Add mobile use from shared module. |
| `src/utils/roles.js` | High | Pure role constants. |
| `src/utils/permissions.js` | High | Pure permission/business rules for admin city access, event/user access, guest privacy. |
| `src/utils/constants.js` | High | Pure constants. |
| `src/utils/storeLinks.js` | High | Reusable with Expo Linking where needed. |
| `src/services/hijriService.js` | High | Pure date conversion/adjustment logic. Good shared candidate. |
| `src/services/recurrenceService.js` | High | Pure recurrence generation logic. Good shared candidate. |
| `src/services/prayerTimeService.js` | High | Pure calculation logic, dependent on event date/address lat/lng. Good shared candidate. |
| `src/services/dateUtils.js` | High | Likely reusable if no DOM/browser dependencies. |
| `src/services/settingsService.js` | Medium/High | Firestore-backed settings likely reusable after checking imports. |
| `src/services/hijriObservanceService.js` | Medium/High | Mostly data/business logic; UI parts should stay out. |
| `src/services/eventService.js` | Medium/High | Firestore queries and validation reusable; Firebase initialization and cache behavior need mobile adaptation. |
| `src/services/userService.js` | Medium/High | Profile merge/roles/reminder/favourites logic reusable; auth persistence and phone login flow need native handling. |
| `src/services/youtubeService.js` | Medium | Callable function client reusable if no web-only OAuth popup/window code remains. |
| `src/services/calendarService.js` | Medium | Feed URLs and backend stats reusable; opening calendar subscription needs native Linking. |
| Bulk share message formatting | Medium | Text generation logic should be extracted; UI/share invocation rebuilt. |

## Web-Specific Modules

These are not suitable for direct reuse in React Native, though some internal business rules may be extracted.

| Module | Current Web Dependency | Native Replacement |
|---|---|---|
| `src/App.jsx` | `window`, `document`, `navigator`, `localStorage`, online/offline events, PWA update events | Expo Router or React Navigation app shell, app lifecycle, AsyncStorage, NetInfo. |
| `src/main.jsx` | React DOM mounting and Vite preload handling | Expo entry point. |
| `src/services/swService.js` | Service worker registration/update lifecycle | Not needed in native app; use store releases and Expo Updates if chosen. |
| `public/sw.js`, `firebase-messaging-sw.js` | PWA offline/web push workers | Not used by native app. |
| `src/services/notificationService.js` | Web Notification API, service worker, FCM web token, browser permission APIs | `expo-notifications`, native FCM/APNs tokens, backend token registration. |
| `src/services/nativeStreamService.js` | Browser media APIs, canvas/video, AudioContext, Wake Lock, screen orientation, Android JS bridge | React Native livestreaming module or native RTMP/WebRTC integration through Expo dev client/custom native module. |
| `src/components/LiveStream.jsx`, `PreCheckCard.jsx` | Browser media preview, web orientation handling, Android wrapper bridge | Native streaming screens and camera/audio controls. |
| `src/components/AddressAutocomplete.jsx` | Injected Google Maps Places script via DOM | `react-native-google-places-autocomplete` or Places HTTP API. |
| `src/services/googleMapsLoader.js` | Injects Google Maps JS script | `react-native-maps` plus Places/Geocoding APIs. |
| `src/components/EventMapView.jsx` | Google Maps JS DOM markers/info windows | `react-native-maps` Markers/Callouts/Clustering. |
| `src/services/geoService.js` | `navigator.geolocation` | `expo-location`. |
| `src/services/imageService.js` | FileReader/canvas/object URLs | `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`. |
| `src/services/eventCache.js` | `localStorage`/`sessionStorage` | AsyncStorage, MMKV, SQLite, or React Query persistence. |
| Static HTML pages | Browser pages under `public/` | In-app screens or WebView for documents; keep web pages for PWA/SEO. |
| Walkthrough | DOM query/rect highlight overlay | React Native coach mark overlay measuring native refs. |
| Download/export CSV | Blob/object URL/download anchor | `expo-file-system` + share sheet. |

## Migration Audit Matrix

| Feature / Module | Current Implementation | Reuse Unchanged | Reuse With Small Modification | Must Rebuild | Reason | Proposed React Native / Expo Replacement |
|---|---|---:|---:|---:|---|---|
| Firebase backend | Existing Firebase project, Firestore, Storage, Functions | Yes | No | No | Backend already supports app workflows. | Same project and Cloud Functions. |
| Firebase config | `src/firebase/firebase.js`, web SDK | No | Yes | No | Native Auth persistence differs. | Firebase JS SDK with React Native persistence, or RN Firebase if later required. |
| Phone authentication | Web Firebase Auth flow in `AuthPage.jsx` | No | Partial | Yes UI | Native OTP UX differs; app verifier/reCAPTCHA differences. | Firebase Auth phone flow, Expo-compatible config, native screens. |
| User profile merge/migration | `userService.js`, callable functions | Mostly | Yes | No | Business rules reusable. | Shared service plus native Auth state. |
| Roles/permissions | `utils/permissions.js`, `roles.js` | Yes | No | No | Pure business logic. | Shared module. |
| Guest privacy | `permissions.js`, EventCard/share logic | Partial | Yes | UI rebuild | Rules reusable; display layer native. | Shared privacy helper + native EventCard. |
| Event listing | `eventService.js`, `Home.jsx`, EventCard components | Service partial | Yes | UI Yes | Queries reusable; UI and cache native. | Shared event service + RN FlatList/cards. |
| Event filtering/sorting | Home filters and helper logic | Partial | Yes | UI Yes | Business logic should be extracted. | Shared filter/sort utilities + native filter controls. |
| City selection | `cities.js`, Home selector | Logic yes | UI yes | UI Yes | City classification reusable. | Shared cities util + native selector. |
| Favourites | `userService.toggleSavedEvent` and UI | Service yes | UI yes | UI Yes | Data model reusable. | Shared service + RN state. |
| Event creation/edit | `EventForm.jsx`, event services | Validation partial | Yes | UI Yes | Form inputs/files/address/time pickers are platform-specific. | Native forms, DateTimePicker, Places, shared validation. |
| Recurring events | `recurrenceService.js`, `AddRecurringEvent.jsx` | Logic yes | UI yes | UI Yes | Recurrence generation reusable. | Shared recurrence service + RN preview UI. |
| Hijri dates | `hijriService.js`, Hijri Calendar page | Logic yes | UI yes | UI Yes | Core date logic reusable; UI native. | Shared Hijri service + native calendar/converter screens. |
| Prayer times | `prayerTimeService.js` | Yes | No | No | Pure calculation. | Shared service. |
| Maps | Google Maps JS map component | No | No | Yes | DOM map cannot run in RN. | `react-native-maps`, native markers/callouts. |
| Directions | `window.open`/maps URLs | No | Yes | UI Yes | URL logic reusable; launching native maps differs. | Expo Linking to Apple/Google Maps. |
| Address autocomplete | Google Places JS script | No | No | Yes | DOM script API. | Google Places native/autocomplete component or HTTP API. |
| Native sharing | Web Share API/WhatsApp/SMS URLs | Text logic partial | Yes | UI Yes | Text formatting reusable; native share sheet differs. | Expo Sharing / React Native Share / Linking. |
| Calendar sync | Web links/calendar feed | Feed yes | Yes | UI Yes | Backend feed unchanged; launch behavior native. | Expo Linking for webcal/Google Calendar; possible native calendar module later. |
| Push notifications | Web FCM and service worker | Backend partial | Yes | Client yes | Native APNs/FCM tokens and permissions differ. | `expo-notifications`, backend token registration, scheduled functions unchanged. |
| Email reminders | Cloud Functions/SES | Yes | No | No | Backend only. | No mobile change. |
| AI search/reporting | Callable/HTTP functions + web UI | Backend yes | UI yes | UI Yes | Functions reusable; UI native. | Native AI search screen and report dialog. |
| Admin dashboard | Large web page + callable functions | Backend yes | Logic partial | UI Yes | Complex DOM-heavy dashboard. | Build native admin screens progressively; reuse callables. |
| Organisations | Firestore + image handling | Service partial | Yes | UI/image yes | Data reusable; image picker/resizer native. | Native org management + Expo image tools. |
| Livestream same device | Web media/Android bridge + Cloud Functions | Backend metadata partial | Yes | Streaming yes | Native camera/audio/live encoding required. | Expo dev client with custom native RTMP/WebRTC module or proven RN streaming SDK. |
| External YouTube link stream | Callable functions + URL input | Mostly | Yes | UI Yes | Backend workflow reusable. | Native URL input/check/stop screen. |
| Streamed videos list | YouTube callable + web cards | Backend yes | UI yes | UI Yes | Video list API reusable. | Native list/cards + Linking to YouTube. |
| Offline cache | Web storage | No | Yes | Yes | Need native persistent storage. | AsyncStorage/MMKV/SQLite with cached event snapshots. |
| PWA install/update | Service worker/browser install | No | No | No | Not relevant to native app. | Store updates, optional Expo Updates. |
| Static legal/user guide pages | HTML files | Content yes | Yes | UI optional | Content reusable; app display can be WebView or native docs. | WebView initially, native docs later. |

## Proposed Shared-Code Architecture

Keep the existing PWA folder untouched and add a separate React Native app folder.

```text
Community Event/
  App/                                  # Existing PWA, continues independently
  shared/                               # Optional shared JS/TS modules introduced gradually
    src/
      constants/
      firebase-models/
      events/
      users/
      dates/
      hijri/
      recurrence/
      permissions/
      cities/
  2. Mobile App - React Native Expo/
    app/                                # Expo Router routes, or src/navigation if using React Navigation
    src/
      firebase/
      services/                         # Thin mobile adapters around shared services
      features/
        auth/
        events/
        profile/
        calendar/
        admin/
        streaming/
        hijri/
      components/
      theme/
      native/
      assets/
```

Recommended rule: extract only pure code into `shared` when both apps need it. Do not move large PWA files just for style. The first mobile version can copy selected pure modules, then later extract them into a formal shared package once the boundaries are proven.

## Native Replacements Required

| Web Capability | Native Replacement |
|---|---|
| Browser routing | Expo Router or React Navigation. |
| DOM/CSS layout | React Native `View`, `Text`, `Pressable`, `TextInput`, `StyleSheet`. |
| Browser localStorage/sessionStorage | AsyncStorage, MMKV, SQLite, or Expo SecureStore for sensitive values. |
| Browser service worker update/offline | Native app release updates; optional Expo Updates later. |
| Web push notification service worker | Expo Notifications with APNs/FCM. |
| Web Share API | Expo Sharing / React Native Share / Linking. |
| Clipboard | Expo Clipboard. |
| Google Maps JS | `react-native-maps` plus Places/Geocoding APIs. |
| Browser geolocation | `expo-location`. |
| File input/FileReader/canvas | Expo Image Picker, Image Manipulator, FileSystem. |
| Web calendar subscription links | Expo Linking; consider native Calendar module only if needed. |
| Browser livestream capture | Custom native streaming module or proven RN SDK through Expo dev client. |
| DOM-based walkthrough | Native coach-mark overlay. |

## Key Risks

1. Phone login on React Native may need careful Firebase Auth setup. The current web phone-login assumptions will not copy exactly.
2. Native push notifications require APNs/FCM setup, store credentials, Firebase app configuration, and token registration per device.
3. Livestreaming is the largest technical risk. Metadata and YouTube Cloud Functions are reusable, but camera/audio capture and RTMP/WebRTC streaming need native implementation.
4. Google Maps/Places needs mobile-safe API key restrictions and possibly separate iOS/Android keys.
5. Admin Dashboard is broad and should be migrated after the regular user flow is stable.
6. Keeping PWA and mobile in sync requires discipline: shared business logic should not diverge into two competing implementations.
7. Existing code is JavaScript, not TypeScript. We can still use Expo with JS first, then add TypeScript gradually.
8. Offline behavior needs a clear native storage strategy; browser storage code is not portable.
9. App Store and Play Store privacy declarations must match new native permissions such as location, notifications, camera, microphone, photos, and possibly calendar.

## Suggested Migration Phases

### Phase 0 - Audit and Setup

- Keep this audit as baseline.
- Create separate Expo app folder.
- Do not alter PWA behavior.
- Decide package IDs:
  - Android: existing package should remain `info.siza.communityevents.app` or the current Play Store package, depending on deployed app identity.
  - iOS: keep existing bundle ID used in App Store.

### Phase 1 - Smallest Viable Native App

- Create Expo project.
- Add app theme, logo, splash, basic navigation.
- Connect Firebase project.
- Read public/active events from Firestore or `getPublicEvents`.
- Display Home event list with city selection and basic EventCard.
- No admin, no creation, no streaming yet.

### Phase 2 - Auth and Profile

- Implement phone login.
- Reuse profile merge/migration callables.
- Load role/default city/email reminders/push settings.
- Add profile screen.
- Add favourites.

### Phase 3 - Core Event UX

- Event details/cards.
- Filters, sorting, city rules, guest privacy.
- Native sharing.
- Directions.
- Map view.
- Calendar sync link behavior.
- Offline cache for visible events.

### Phase 4 - Native Features

- Location permission and city suggestion, only after store privacy declarations are updated.
- Native push registration and test notifications.
- Native image picker/upload for event posters/org logos.
- Native calendar/deep-link refinements.

### Phase 5 - Event Creation and Management

- Single event form.
- Recurring event form.
- Validation parity with PWA.
- Hijri/prayer-time event handling.
- My Events and edit/delete flows.

### Phase 6 - Admin and Advanced Features

- Admin dashboard, city-scoped admin rules.
- User management.
- Organisations management.
- Bulk share and community update message flows.
- Hijri correction/admin observance tools.
- AI search/report flow.

### Phase 7 - Livestreaming

- Reuse YouTube OAuth and stream Cloud Functions.
- Build native camera/audio streaming screen.
- Support public/private stream choice.
- Support same-device and external-device stream flows.
- Add stream health, stop, and cleanup behavior.
- Validate Android first, then iOS.

## Realistic Code Reuse Estimate

| Area | Expected Reuse |
|---|---:|
| Firebase backend and database schema | 90-95% |
| Cloud Functions | 85-95% |
| Pure utilities and business rules | 75-90% |
| Firestore service logic | 55-75% |
| Date/Hijri/prayer/recurrence logic | 80-95% |
| Notification backend | 70-85% |
| Notification client code | 10-25% |
| Maps/address UI | 10-25% |
| Event form UI | 20-35% |
| Event list/card UI | 15-30% |
| Admin UI | 10-25% |
| Livestream metadata/backend | 50-70% |
| Livestream camera/audio client | 5-20% |
| Overall practical reuse | 55-65% |

## Recommendation

Proceed with an incremental Expo app, not a big-bang migration.

The first implementation milestone should be: native Expo shell + Firebase connection + Home event list + city selector + event details. This proves the same backend works from the new client while keeping risk low. Authentication and native features should follow after the basic read-only app is stable.

Do not start by rebuilding admin or livestreaming. Those are high-value, but they are also the highest-risk areas and should come after the native data/client architecture is proven.

## Immediate Next Step

Create the Expo app in this folder and connect it to Firebase in read-only mode. The first build should show the Community Events Australia splash/logo and a native Home screen loading active events from the existing backend.
