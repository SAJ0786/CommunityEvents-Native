# Community Connect Australia — store listing draft

This is a product/reviewer draft, not a substitute for the final legal, privacy or store-console declarations.

## Shared identity

- App name: **Community Connect Australia**
- Events module title: **Community Events Australia**
- Directory module title: **Community Businesses Australia**
- Version: **1.0.0**
- Default language: **English (Australia)**
- Suggested category: **Lifestyle** (primary), **Business** (secondary where supported)
- Initial commercial model: free; no advertising, in-app purchases or paid listing transactions in version 1

## Apple App Store

Subtitle (30 characters maximum):

> Events & Local Businesses

Promotional text:

> Discover community events, follow live programs, manage reminders and connect with local Australian businesses in one app.

Keywords draft (validate length in App Store Connect):

> community events,business directory,Australia,local,prayer,Hijri,live stream,calendar

## Google Play

Short description (80 characters maximum):

> Discover community events, live programs and local Australian businesses.

## Full description

Community Connect Australia brings community events and local businesses together in one mobile app.

Use Community Events Australia to browse upcoming programs by city, switch between list and map views, open event details, contact the host, get directions, share events, save reminders and add events to your calendar. Supported community features include Hijri calendar tools, city-based prayer times, streamed-video listings and live YouTube event links.

Use Community Businesses Australia to discover local services by city, category and subcategory. View business details, current opening hours and promotions, then contact the business or open its website, social links and directions. Business owners can submit and manage listings and promotions for administrator review.

You can browse as a guest or sign in with a verified Australian mobile number for account features. Events and business information is user-submitted. Always verify event details with the host and independently check a business's identity, ownership, licences, qualifications, insurance, service quality and legal compliance before engaging it. An ABN Verified badge confirms only the recorded ABN status/name check at the stated time; it is not an endorsement.

## Public URLs — must be updated before submission

- Privacy Policy: https://communityevents.siza.info/privacy.html
- Terms of Use: https://communityevents.siza.info/terms.html
- Support: https://communityevents.siza.info/support.html
- Account deletion: https://communityevents.siza.info/delete-account.html

The first two pages currently describe the Events product and must be replaced with the legally reviewed consolidated Community Connect Australia versions before either store submission. Native-entry legal pages must not contain Home, Back to App or PWA navigation links.

## Reviewer notes draft

- The app opens on the Community Connect Australia login/guest choice. Reviewers can select **Browse as Guest** without authentication.
- Account-only features use Firebase phone authentication with Australian mobile numbers. Supply Apple and Google reviewers with a working review phone/test path and any required verification instructions; never ask reviewers to use a personal employee account.
- Explain the Events/Business module switch at the top of the app.
- Provide a test user with representative Events and Business records and a separate authorised admin test account if administration is in review scope.
- Keep Firebase, Google Maps/Places, address autocomplete, ABR verification, notifications, email workflows, poster/logo storage, YouTube links and all callable functions available throughout review.
- No background camera streaming is claimed. An active in-app stream may be minimised within the app; OS backgrounding or calls can interrupt capture and the app attempts to resume the same stream session when the user returns.
- Location is optional and used only when the user asks for current/nearby city, map location or distance. A city can always be selected manually.

## Permission explanations

- Camera: start an event live stream or capture/select user-requested event/business imagery where applicable.
- Microphone: include audio in an event live stream.
- Photos: choose event posters and business images.
- Location while using the app: select the nearest supported city, show current position and calculate event distance.
- Calendar: add an event selected by the user to the device calendar.
- Notifications: event reminders, live-event alerts, Business Directory workflow updates and user-selected app updates.

## Data-declaration inventory

Review the final implementation and declare at least the applicable categories for:

- phone number, name and optional email;
- user ID, role, city and preferences;
- precise/approximate location when requested;
- user-submitted Events, Businesses, Promotions, posters/logos and contact details;
- in-app messages, feedback, reports and administrative decisions;
- notification tokens and calendar/reminder actions;
- camera/microphone live-stream data and YouTube stream metadata;
- Firebase Crashlytics diagnostics, app version, device/OS information and operational logs.

App Privacy/Data safety answers must include third-party processing by Firebase/Google Cloud, Crashlytics, Google Maps/Places, YouTube, notification delivery and email infrastructure. They must match the published Privacy Policy exactly.

## Screenshot capture plan

Capture clean production-candidate screens with fictional, consented test data only:

1. Community Connect Australia login and guest choice.
2. Events home with city/location and List/Map controls.
3. Compact expanded event drawer with action icons.
4. Map marker event popup.
5. Prayer times/Hijri calendar.
6. Business Directory category/subcategory search.
7. Modern business detail page with promotion and social actions.
8. Profile, notification preferences and visible account deletion.

Do not include phone numbers, private addresses, OTPs, admin emails, API keys or real unlaunched business data in store screenshots.
