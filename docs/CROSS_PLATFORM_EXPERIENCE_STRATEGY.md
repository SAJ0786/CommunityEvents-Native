# Community Connect Australia cross-platform experience strategy

## Objective

Android, iOS, the PWA and the Windows-installed PWA must present the same product structure, terminology, workflows and visual hierarchy. Platform capabilities may use different native adapters, but users should not have to relearn the application.

## Shared by design

The following assets must remain platform-neutral and be consumed by both native and web implementations:

- product and module names, descriptions, icon identifiers and landing behaviour;
- colours, spacing, typography scale, corner radii and component states;
- navigation definitions and role-based feature visibility;
- form schemas, validation messages and date/time business rules;
- event and business view models, filters and sorting rules;
- notification and email event names plus recipient-routing rules;
- empty, loading, success, approval and error-state language;
- Firebase collection/function contracts and analytics event names.

The approved entry experience starts this approach in `src/config/moduleExperience.js`. It contains no React Native imports and can be reused directly or exported to the PWA package.

## Platform adapters

Keep these capabilities behind a small interface so each platform can supply its own implementation:

| Capability | Native implementation | PWA/Windows implementation |
| --- | --- | --- |
| Push notifications | FCM/APNs and local notifications | Web Push and service worker |
| Camera/live stream | Native camera and encoder | MediaDevices/WebRTC encoder |
| Azaan playback | Native audio and notification action | Web Audio with browser permission limits |
| Maps/navigation | Native map and external navigation intent | Web map and browser navigation URL |
| Calendar sync | Device calendar API | Download/subscribe ICS and supported web calendar links |
| File/image selection | Native picker | Browser file input |
| Secure local state | Native secure storage | Appropriate browser storage with no server secrets |

ABR GUIDs, AWS SES credentials and all privileged Firebase operations remain server-side for every client.

## Responsive rules

- Use content-driven layouts rather than fixed screen coordinates.
- Support narrow phones, large phones, tablets and resizable desktop windows.
- Keep headings and descriptions in separate blocks; do not rely on inline wrapping for structural hierarchy.
- Permit accessible text growth while capping compact navigation labels and allowing content pages to scroll.
- Use the same breakpoints and test fixtures for native screenshots and browser visual regression.

## Delivery gate for each feature

Before a feature is marked complete, record:

1. shared data and validation rules;
2. native UI/device verification;
3. PWA responsive behaviour or an explicit scheduled parity item;
4. any unavoidable platform exception and its user-facing effect;
5. accessibility and large-text verification;
6. analytics/notification contract parity.

The QA workbook must distinguish **source implemented**, **native device verified**, **PWA verified** and **user accepted**. A feature is cross-platform complete only after the applicable native and PWA checks pass.

## Recommended conversion sequence

1. Extract remaining product constants, design tokens and validation rules from screen components.
2. Establish a web component library that consumes the same tokens and view models.
3. Reproduce authentication, the approved module-entry flow and module switching.
4. Convert read-only Events and Business Directory browsing before administrative workflows.
5. Add forms, notifications and platform adapters.
6. Run the same seeded-data QA scenarios across Android, iOS and the installed Windows PWA.

