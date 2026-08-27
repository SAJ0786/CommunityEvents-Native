# Native App Review Comments

Development is paused while the installed Android build is reviewed. Items in this register are recorded for later rectification and are not implementation approval.

## 18 August 2026

### R-001 — Notification controls are incomplete

Profile and Settings do not provide the required notification-channel controls. The later rectification should provide clearly labelled controls for:

- Push notifications on the phone
- SMS notifications
- Email notifications

The final notification events and sensible defaults should be defined before implementation.

### R-002 — Business organisation affiliation is irrelevant

A registered business has no affiliation with an organisation. Remove organisation affiliation from the complete Business Directory workflow, including:

- Business registration and editing
- Required-field validation
- Stored business payloads for new records
- Business cards and business details
- Search, filters and badges
- Owner and administrator views

Existing test records containing affiliation data can retain it during migration, but the field should no longer be displayed or used.

### R-003 — Missing business categories

Add these top-level categories:

- Construction & Builders
- Technology

### R-004 — Categories need subcategories

Replace the flat category-only model with a category and subcategory hierarchy. Recommended interaction:

1. Select one primary category.
2. Show a compact second selector containing only that category's subcategories.
3. Allow one or more relevant subcategories, with an `Other` fallback.
4. Store stable IDs as well as display labels.
5. Allow directory search and filtering at both category and subcategory level.

## Proposed business category matrix

| Primary category | Proposed subcategories |
| --- | --- |
| Food & Catering | Restaurants & Cafes; Home Kitchens; Catering; Bakeries & Desserts; Groceries & Specialty Foods; Halal Meat & Butchers; Food Trucks; Beverages; Meal Preparation |
| Events & Celebrations | Event Planning; Venues & Function Centres; Photography & Videography; Decorations & Styling; Florists; Sound, Lighting & AV; Entertainment, DJs & MCs; Invitations, Printing & Signage; Marquee, Furniture & Equipment Hire; Wedding Services |
| Retail & Fashion | Clothing & Fashion; Modest Fashion & Hijab; Tailoring & Alterations; Footwear & Accessories; Jewellery & Watches; Beauty, Cosmetics & Fragrances; Gifts & Homewares; Books & Religious Goods; General Retail; Online Stores |
| Professional Services | Accounting, Bookkeeping & Tax; Legal Services; Finance & Mortgage Brokers; Insurance; Real Estate; Business Consulting; Marketing & Branding; Human Resources & Recruitment; Translation & Interpreting; Administration & Virtual Assistance |
| Health & Wellness | General Practice & Medical; Dental; Pharmacy; Physiotherapy & Rehabilitation; Psychology & Counselling; Optometry; Nutrition & Dietetics; Fitness & Personal Training; Allied Health; Aged, Disability & Home Care; Personal Care & Grooming |
| Education | Early Childhood & Childcare; Primary & Secondary Tutoring; Quran & Islamic Education; Languages; Vocational & Trade Training; University & Higher Education Support; Music & Arts; Driving Schools; Online Courses; Special Learning Support |
| Home Services | Cleaning; Gardening & Lawn Care; Pest Control; Handyman & Minor Repairs; Appliance Repair; Locksmiths & Security; Removalists & Storage; Property Maintenance; Pool Services; Home Organisation |
| Automotive | Mechanical Repairs & Servicing; Tyres & Wheels; Auto Electrical; Panel Beating & Paint; Car Wash & Detailing; Roadside Assistance & Towing; Parts & Accessories; Vehicle Sales; Vehicle Rental; Inspections; Motorcycles |
| Construction & Builders | Residential Builders; Commercial Builders; Renovations & Extensions; Architects & Building Designers; Engineering & Surveying; Project Management; Carpentry & Joinery; Plumbing, Electrical & HVAC; Roofing & Gutters; Concreting, Bricklaying & Masonry; Tiling, Flooring, Painting & Plastering; Demolition, Excavation & Waterproofing |
| Technology | IT Support & Managed Services; Software & App Development; Website & E-commerce Development; Cybersecurity; Cloud, Networking & Infrastructure; Data, AI & Automation; Telecommunications; Computers, Devices & Repairs; Business Systems & Point of Sale; CCTV, Security & Smart Home; Technology Consulting & Training |

### Classification rule for overlapping services

- Use **Construction & Builders** for new construction, renovation projects and project-based building trades.
- Use **Home Services** for recurring maintenance, household support and minor repairs.
- A business chooses one primary category and may select multiple subcategories within it. Cross-category support can be considered later if real listings demonstrate a need.

### R-005 — Business category matrix approved

The proposed categories and subcategories in this review register are approved for later implementation.

### R-006 — Event drawer swipe and close animation remain defective

- Swipe down to close the expanded Event Card drawer is still not working.
- In the latest APK, pressing close briefly shows the Event Card drawer again before it disappears.
- Later rectification must fix both gesture handling and the close-animation/state sequencing so the drawer closes once, smoothly, without flashing or reopening.

### R-007 — Add Event date needs a calendar input

Replace manually formatted date entry in Add Event with a native-style calendar/date picker. The selected date should be displayed in the app's standard Australian format and stored in the canonical format required by the backend.

### R-008 — Add Event time needs a selector

Replace manually formatted time entry with a compact time picker/dropdown. Apply this consistently to start time, optional end time and recurring-event time fields.

### R-009 — Compact Home location control

Redesign the Home location panel to use a prominent location-marker icon and the selected city abbreviation. It should remain easy to recognise and tap while occupying substantially less screen space.

### R-010 — List/Map sliding toggle beside location control

Place a compact List/Map segmented sliding toggle beside the city/location control. The active view should be clearly highlighted and switching views should not disturb the selected city or filters.

### R-011 — Live Events button and filter

When at least one event is currently live:

- Show a separate red `LIVE` button beside the **Upcoming Events** title.
- Give the `LIVE` text a noticeable blinking or pulsing treatment.
- First press filters the Home results to currently live events.
- Pressing it again restores all events.
- Keep the button visible while any event remains live, including while the Live-only filter is inactive.
- Automatically remove the button and clear the Live-only filter when no events are live.

### R-012 — Module-aware hamburger menus

The hamburger menu must follow the currently selected module:

- When **Community Events Australia** is selected, show only Events-related menu items.
- When **Community Businesses Australia** is selected, show only Business Directory-related menu items.
- Do not show Events-only destinations such as Hijri Calendar or Streamed Videos while the Business Directory is selected.
- Switching modules should immediately switch the menu structure without changing the user's signed-in session.

The Business Directory hamburger menu should contain:

1. **Settings / Business Administration** — access to the Business Directory Admin Dashboard, visible only to users with the required Business Directory administrator role.
2. **Contact Us** — Business Directory contact and support page.
3. **Report a Business** — a reporting workflow similar to Feedback, prefilled with the selected business when opened from a Business Page.
4. **Inbox** — conversations and messages relevant to the signed-in user or business owner.
5. **Profile & Settings** — personal details plus Business Directory-specific preferences, notifications and policy links.

### R-013 — Contact Business and Business Inbox

- Add a **Contact Business** button to each Business Page.
- In-app messages sent through this button should be delivered to the inbox of the respective verified business owner or authorised business representative.
- Keep conversations linked to the business, sender and recipient.
- The Business Directory Inbox must not mix messages with unrelated Events feedback or administration messages.
- Later design must include unread state, timestamps, conversation history, reporting/blocking protection and privacy-safe handling of personal contact details.

### R-014 — Business Directory Profile & Settings

The Business Directory Profile & Settings page should include:

- The same personal-details section pattern used by Community Events.
- Business Directory-only notification controls and preferences.
- The user's default opening module, alongside existing preferences such as default city.
- Access to the applicable Privacy Policy, Terms of Use and related policies.

Events-only notification settings must not be presented as Business Directory settings, although both modules may use the same underlying user account.

### R-015 — Consolidated legal documents

Use consolidated platform-wide legal documents rather than separate incomplete documents for each module:

- One Privacy Policy covering Community Events Australia and Community Businesses Australia.
- One Terms of Use covering both modules, with clearly labelled module-specific sections where necessary.
- The sign-in consent should apply before the user chooses or opens either module.
- All policy links in both modules should open the same current consolidated documents.
- Maintain one version number, effective date and consent record for each consolidated document.

Separate supplementary policies may still be linked where operationally necessary, such as Business Listing Rules, Content Standards, Promotions Terms or Refund Policy, but they should sit under the consolidated platform terms and must not contradict them.

### R-016 — Remembered default module at sign-in

- Add an Events / Business Directory segmented toggle to sign-in so the user can choose which module opens after authentication.
- Remember that selection for future launches and sign-ins.
- Allow the user to switch modules at any time inside the app using the main module slider.
- Add a **Default module** preference to Profile & Settings, similar to Default city.
- Changing the default affects future app launches; it must not restrict access to the other module.
- If no preference exists, default to Community Events Australia while still showing both choices.

### Pending review entry

The submitted item 4 was blank and remains available for the next review comment.

### R-017 — Business Approvals belong only to Business Directory administration

This clarifies R-012:

- **Business Approvals** must not appear in the Community Events hamburger menu or the Events Admin Dashboard.
- Business Approvals and every Business Directory-specific administration tool must be accessible only from the **Community Businesses Australia** hamburger menu through its Business Administration dashboard.
- Events-specific administration tools must remain in the Community Events Admin Dashboard only.
- Common destinations may appear in both module menus, but they must open in the selected module's context. For example, Inbox, Contact Us, Profile & Settings and policies should show the correct module-specific messages, preferences and entry points.
- Do not combine Business and Events administration tools into one visible dashboard, even if they share authentication, user records or backend infrastructure.

### R-018 — Add Business should open the form directly

- Pressing **Add Business** in the Business Directory bottom navigation should open the Add Business form directly.
- Remove the intermediate owner/preview screen from this action.
- Remove the **Add another business** function.
- The intended account flow is one managed business listing rather than repeatedly creating additional listings from this button.
- When the signed-in user already has a listing, the same area should manage or edit that listing instead of offering another new listing.

### R-019 — Business logo and Business Page rendering defects

The screenshots dated 18 August 2026 confirm the following defects:

- The approved directory result card for SIZA Apps shows the initials fallback `SA` instead of the uploaded business logo.
- The Business Page hero/logo area is cropped and positioned incorrectly at the top of the screen.
- Action icons are rendering as raw escape text, including `\\u260E`, `\\u2709`, `\\u27A4` and `\\u21E7`, rather than visible Call, WhatsApp, Directions and Share icons.
- Information-row icons are also rendering as raw escape text and wrapping over multiple lines.
- The obsolete `Independent / Unaffiliated` badge is still displayed; remove it as already required by R-002.
- The page needs a full layout review for safe-area/header positioning, image scaling, icon rendering, spacing and bottom-content visibility.

Later rectification must use the uploaded logo consistently on directory cards and the Business Page, retain a clean fallback only when no valid logo exists, and use the app's supported icon component rather than escaped text literals.

### R-020 — Standard fallback logo and cover image

Provide bundled standard artwork for businesses that do not upload imagery:

- A square, neutral **Community Businesses Australia** storefront logo placeholder.
- A wide, neutral Business Directory cover/background image.
- Use the fallback not only when an image URL is empty, but also when a remote image fails to load.
- Use the same fallback rules on directory cards, search results, owner/admin screens, Business Pages, promotions and sharing previews.
- Keep the artwork category-neutral, text-light and compatible with light/dark overlays so it cannot be mistaken for the individual business's own branding.
- Preserve uploaded logo and cover images separately; do not stretch a square logo into a wide cover area.

Standard source assets should be high resolution, with app-generated size variants for card thumbnails and Business Page display.

### R-021 — Strategy for providers without a valid ABN

The current build requires a valid ABN checksum and administrator ABR confirmation before approval, so a no-ABN listing is currently not possible.

#### Recommended policy

Allow selected providers to list without an ABN, but do **not** display an invalid number or describe it as an `Unverified ABN`. Use an explicit public status such as:

- **ABN verified** — an active ABN has been checked and its entity/business name matches the listing.
- **Identity checked · ABN not provided** — the owner and contact details have passed the platform's alternative review, but the platform has not verified an ABN.
- **ABN pending** — application is in progress; normally keep the listing private until it moves to one of the two publishable states above.

An entered ABN that is invalid, cancelled or belongs to a different entity must be corrected or removed. It must not automatically become a no-ABN listing.

#### Registration workflow

1. Ask `Do you have an ABN?` with **Yes**, **Application pending**, and **No / not required** choices.
2. If Yes, retain ABR validation and name matching.
3. If pending, collect no sensitive ABN application reference; save a private draft and remind the owner to add the active ABN later.
4. If No, ask for the reason and show official guidance explaining that most businesses need an ABN, although it is not compulsory for every activity.
5. Require verified mobile number, verified email, legal name, service address/area, declaration of authority, and evidence appropriate to the service.
6. Have an administrator manually approve or request changes.
7. Allow an owner to add an ABN later, triggering re-review and an upgrade to **ABN verified**.

#### Restrictions for no-ABN listings

- Basic/free listing only.
- No `Verified Business`, ABN-verified, featured or founding-member badge.
- No paid promotions or boosted placement until an active ABN is verified.
- Clearly display `ABN not provided` on the Business Page.
- Periodic re-verification of identity and contact details.
- Immediate review following credible reports, failed contact verification or misleading claims.

#### Regulated or higher-risk services

ABN verification alone does not prove professional licensing. Any subcategory requiring a licence, registration, permit or insurance must have category/jurisdiction-specific evidence. For higher-risk services—such as regulated building trades, health, childcare, legal, financial and other licensed activities—require an active ABN plus the applicable licence/registration before public listing. Do not permit the alternative no-ABN route for those regulated subcategories.

#### Data and privacy safeguard

Avoid storing raw identity-document images in the normal business record. Use a dedicated identity-verification provider later, or a tightly controlled manual process with minimum retention, restricted administrator access and documented deletion periods. Store the verification result and audit trail rather than exposing identity documents to ordinary app administration.

This strategy is proposed for product approval and legal/privacy review before implementation.

### R-022 — Category compliance matrix prepared for review

A separate Excel review workbook has been prepared for the approved 10 categories and 104 subcategories:

`business-docs/Community_Businesses_Category_Compliance_Matrix_2026-08-18_Draft.xlsx`

It records the proposed risk level, ABN policy, identity-verification level, licence/registration review, no-ABN publication rule, minimum evidence, official verification sources, public badge and review decision for every subcategory. The workbook is a product-policy draft rather than legal advice; jurisdiction-specific requirements must be confirmed before implementation.

## Review batch received 19 August 2026

### R-023 — Event Card action permissions by role

Show Copy, Edit and Delete actions according to this permission matrix:

| Role | Copy | Edit | Delete | Scope |
| --- | --- | --- | --- | --- |
| Super Admin | Yes | Yes | Yes | Every event, regardless of city or owner |
| Admin | Yes | Yes | Yes | Every event in the admin's assigned city only |
| Signed-in user | No | Yes | Yes | Events created/owned by that user only |
| Guest | No | No | No | No management actions |

The current APK does not consistently show the actions required by this logic. Apply the same authorisation checks in both UI visibility and backend operations; hiding a button alone is not sufficient security.

### R-024 — Favourite heart and automatic reminder

- Replace the star favourite icon on Event Cards with a heart, matching the PWA.
- Favouriting an event should automatically create a reminder for **7:00 pm on the day before the event**.
- Removing an event from favourites should remove the automatically created favourite reminder unless the user has separately customised it.
- Avoid duplicate reminders when the event is favourited repeatedly or its details change.
- Respect the user's notification permission and reminder settings.

### R-025 — Modern Calendar sync action

Redesign **Sync to my Calendar** on the Calendar page as a prominent modern call-to-action, using a recognisable calendar icon, highlighted colour, clear pressed/loading/success states and suitable accessibility labelling.

### R-026 — Alphabetical and city-grouped selectors

- On Add Event, sort organiser options alphabetically by organiser name and group them by city.
- Sort the city groups alphabetically by full city name.
- Sort every city/location selector in the app alphabetically by full city name, not by abbreviation or insertion order.
- Preserve a compact selector with search when the list becomes long.

### R-027 — Event poster uploader must match PWA behaviour

- Reproduce the PWA poster-upload area, including its camera icon and explanatory comments.
- Make the entire grey upload box clickable, not only the icon or text.
- Tapping anywhere within it should open the native image source/picker popup.
- Retain file-size/type validation, preview, replace and remove behaviour.

### R-028 — Add-only Event Type and Reciter administration

In Admin Dashboard Settings, add management for the **Event Type** and **Reciter** option lists:

- Authorised administrators may add new items when requested by users.
- Existing items cannot be deleted.
- Prevent duplicates using normalised, case-insensitive matching.
- Newly added values should become available in Add/Edit Event selectors without an app release.
- Keep an audit record of who added each item and when.

### R-029 — Crash Monitoring and Diagnostics module

Implement crash monitoring and diagnostics according to:

`C:\Users\sajja\OneDrive - SIZA Family\1. Professional\AI Apps\Community Event\Project Documentation\Crash Monitoring and Diagnostic Brief.pdf`

The file's existence was confirmed on 19 August 2026. It must be reviewed in full before implementation. User-facing crash capture and administrator diagnostics should feed the Troubleshooting Management area defined below, with appropriate privacy, retention and access controls.

### R-030 — About page visual redesign and version status

- Use the supplied SIZA Apps logo from:
  `C:\Users\sajja\OneDrive - SIZA Family\1. Professional\AI Apps\Community Event\Images\SIZA_Apps.jpg`
- The logo file's existence was confirmed on 19 August 2026.
- Match the polished PWA About presentation and improve spacing, typography, colour and branding.
- Show app version and Android/iOS build number.
- Compare the installed version against the current supported release and visibly highlight when it is outdated.
- The version check must fail gracefully when offline and must not falsely label a development/test build as a production update.

### R-031 — Hamburger Home behaviour and module switcher

- Remove the separate **Business Directory** menu item from the hamburger menu.
- **Home** should return to the Home page while preserving whichever module is selected in the Events/Business Directory slider.
- Module switching remains controlled by the main slider rather than duplicate hamburger destinations.

### R-032 — Hijri prayer-time cards and Prayer Time reminders

- Redesign the prayer-time cards to be smaller, bolder, more visible and visually closer to the PWA.
- Display: **Fajr, Sunrise, Zohrain, Sunset, Maghrebain**.
- Enable Prayer Time reminders by default for **Fajr, Zohrain and Maghrebain** after notification permission/consent is available.
- Allow users to turn Prayer Time reminders off in Profile settings.
- Sunrise and Sunset remain visible but are not default reminder times.
- Recalculate local times using the user's selected/current city and date.

### R-033 — Rename Important Dates

Rename **Important Dates** to **Key Islamic Events** throughout the Hijri Calendar UI and related accessibility labels.

### R-034 — Hijri Calendar search, type filter and monthly behaviour

- Place a search box below **Key Islamic Events**.
- Replace the All/Wiladat/Shahadat/Wafat and similar tile row with an **Event type** selector.
- The selector must support compact multi-select.
- With no search/filter selection, show only the current Hijri month's events and a title such as **Events in Safar**.
- Once the user searches or selects one or more event types, remove the monthly title and show the matching filtered results.
- Empty/clear actions should restore the default current-month view.
- Modernise the full Hijri Calendar page with suitable colour, iconography, hierarchy and typography; it is currently too plain.

### R-035 — Remove Bulk Share back-to-profile button

Remove the Back button from Bulk Share Events that returns to Profile. No replacement back button is required on that page; normal app navigation should handle leaving the screen.

### R-036 — Compact Admin identity panel and fixed-size metrics panel

- Reduce the height of the top administrator identity/name panel to approximately half its current height.
- Keep the main dashboard metrics panel at its current overall size.
- Within that unchanged metrics panel, show: **Users, Active Events, Registered Organisations, Pending Feedback Responses, Inbox Items, Videos Streamed**.
- Videos Streamed should include public and private streams, with a clear combined count or labelled breakdown.

### R-037 — Events Admin Dashboard information architecture

The Events Admin Dashboard should contain exactly these top-level areas:

1. User Management
2. Event Management
3. Organisation Management
4. Calendar Settings
5. Community Messaging
6. Troubleshooting Management
7. Tools

Every child page must have a consistent Back action that returns to the main Admin Dashboard. It must not return to Profile or Home.

### R-038 — User Management parity with PWA

- Reproduce the PWA User Management dashboard and its clickable summary cards instead of the current 12-value card layout.
- Add the PWA-equivalent Calendar Sync filter as a toggle.
- Add a Location filter using a compact dropdown.
- Retain a search box.
- Provide a prominent clickable **Export CSV** action.
- Sort users by date joined, with the final ascending/descending default to be confirmed during implementation review.
- Show **Calendar Synced** and city tags on each applicable user card.
- Modernise User Card actions with meaningful icons consistent with Event Card actions.

### R-039 — Event Management parity and controls

- Reproduce the PWA Event Management view with the same eight clickable dashboard cards.
- Use dropdowns for Organiser type and Event type filters/inputs.
- Make dashboard Event Card scrolling as smooth as the Home event list.
- Every collapsed dashboard Event Card must provide **Hide Event, Delete and Transfer**.
- Transfer opens a searchable user selector; typing filters names, and **Confirm Transfer** remains disabled until a user is selected.
- Require final confirmation before transferring and update ownership atomically with an audit record.
- The expanded Event Card must include all Home Event Card actions plus Hide Event, Delete, Transfer and **Remove Live Stale Event**.
- Destructive operations require suitable confirmation and role/city authorisation.

### R-040 — Organisation Management visual refresh

Organisation Management functionality is acceptable. Retain it and modernise the page's visual design, spacing, typography, icons, controls and feedback states.

### R-041 — Calendar Settings scope reduction

Calendar Settings in the Events Admin Dashboard should contain **Hijri Calendar Adjustment only**.

Remove from this Admin Dashboard section:

- Important Hijri Dates
- Hijri Repair Tool
- Hijri Calendar destination

Hijri Calendar remains a separate main hamburger-menu item. Hijri Repair Tool is removed from the visible product navigation.

### R-042 — Community Messaging scope

Community Messaging should contain, in order:

1. **Community Update Message**
2. **Email Reminders**

Remove **Send Store Announcement**.

### R-043 — Troubleshooting Management

Create a Troubleshooting Management area that consolidates crash monitoring, diagnostic review and remediation tools defined by the Crash Monitoring and Diagnostic Brief. Its final items will be determined after the brief is analysed and the monitoring architecture is selected.

### R-044 — Events Admin Tools

- Place **YouTube Live Connection** under Tools.
- Keep Tools extensible for additional approved utilities later.

### R-045 — Remove misplaced modules from Events Admin Dashboard

Remove the following from the Events Admin Dashboard:

- Business Approvals
- Bulk Share Events
- Streamed Videos
- Hijri Repair Tool
- Hijri Calendar
- Feedback
- Inbox

Business Approvals belongs only to the Business Directory Admin Dashboard. Bulk Share, Streamed Videos, Hijri Calendar, Feedback and Inbox remain main navigation destinations where applicable rather than Admin Dashboard modules.

### R-046 — Profile access and hamburger logout

- Remove **Profile & Settings** from the hamburger menu; access it through the Profile bottom-navigation destination.
- Put Logout in the hamburger menu's top identity panel, matching the PWA placement.
- Use a clearly red logout icon rather than a text-only Logout control.
- Retain confirmation/protection against accidental logout if needed.

This latest navigation decision supersedes earlier review wording that placed Profile & Settings inside each module's hamburger menu; the Profile area must still present module-appropriate settings.

### R-047 — Quick icons for Streamed Videos and Hijri Calendar

It is feasible to provide two compact, recognisable quick-action icon buttons:

- A YouTube/video-style icon for **Streamed Videos**.
- A distinctive lunar/calendar icon for **Hijri Calendar**.

Use labelled accessibility text and tooltips/visible labels where needed so they are not icon-only for assistive technologies. Final placement should remain compact without crowding the title or safe area.

### R-048 — Business Directory-only hamburger menu

While Community Businesses Australia is selected, show only Business Directory and shared module-aware navigation. Do not show Events-only items such as Bulk Share Events, Streamed Videos or Hijri Calendar. This reinforces R-012 and R-017.

### R-049 — Business Directory Admin Dashboard structure

Create a separate Business Directory Admin Dashboard with:

- A compact administrator identity/name panel matching the Events dashboard dimensions but visually differentiated, potentially with a pink accent.
- A fixed-size clickable metrics panel showing: **Registered Businesses, Waiting for Approval, Draft, Rejected, Users, Upcoming Promotions, Current Promotions**.
- **Business Approvals** using the existing approval workflow after the recorded ABN/category changes.
- **Users**, following the Events User Management interaction pattern but scoped to Business Directory needs.
- **Businesses**, using a management list/dashboard similar to Users.
- **Business Messaging**, reusing shared messaging infrastructure but showing Business Directory conversations and audiences only.
- **Troubleshooting Management**, using the shared crash/diagnostic module with Business Directory filtering.
- **Tools**, initially including ABN Lookup and allowing future approved business utilities.

Events and Business dashboards may reuse shared components and backend services, but their visible navigation, metrics, data scope and terminology must remain separate.

### R-050 — Prayer times follow the active Home city

Hijri Calendar prayer times and prayer reminders must use the city currently selected on the Events Home page. The saved profile default city is only a fallback when no active Home city is available.

### R-051 — Add Business and My Businesses are separate actions

- **Add Business** always opens a blank new-listing form.
- Existing listings are opened for editing only from **My Businesses**.
- Closing or successfully submitting an Add/Edit Business form returns to **My Businesses**.

### R-052 — Promotion visibility

An approved, active and in-date promotion must appear on the Promotions page. A signed-in owner’s active promotions remain visible there even if the currently selected directory city differs from the business city.

### R-053 — Business Directory bottom navigation

Replace Business Favourites with **My Business** in the Business Directory bottom navigation. Business Favourites may remain available as a secondary feature but are not a primary bottom-navigation destination.

### R-054 — Directory Profile links

The Directory Profile rows for **My Businesses**, **Directory notifications** and **Help & Policies** must be actionable. My Businesses opens the owner listing area; notifications and policies open the shared Profile & Settings controls.

### R-055 — Business messages and feedback separation

- **Contact Business** creates a private Business Inbox conversation between the user and listing owner.
- **Report a Business** and **Contact Us** create Business Feedback/support threads for authorised Business Directory administrators.
- Business reports and Contact Us must never appear in Events Feedback.
- The complete routing is defined in `docs/Business-Directory-Message-Routing-Matrix.md`.

### R-056 — Business Feedback navigation

Add **Business Feedback** to the Business Directory hamburger menu. Users see their own Business reports and Contact Us conversations; authorised administrators see the Business support queue in Business Admin Dashboard → Business Messaging.

### R-057 — Interactive Business Page information

- Show clickable Website, Facebook, Instagram and X icons only when their URLs are supplied.
- Clicking the address opens navigation.
- Clicking Opening Hours opens the Hours tab.
- Add X/Twitter URL collection to the Business listing form and public projection.

### R-058 — Active promotion indicator

When a business has a current approved promotion, show a flashing promotion badge beside its name. Clicking it opens the business Promotions/Offers tab.

### R-059 — Promotion publication regression

Approved, active and in-date promotions must be read from the public promotion projection without being accidentally removed by client-side date filtering. The public Promotions page, public business card promotion badge and business Offers tab must all use the same active promotion set.

### R-060 — Native date and time entry

Use native date and time pickers instead of manual formatted text wherever Gregorian dates or clock times are entered, including event dates/times, recurring event dates, business promotion dates, business opening hours, administrator reminder dates/months, Hijri anchor Gregorian dates and Gregorian-to-Hijri conversion.

### R-061 — Directory subcategory search

After selecting a Business Directory category, show a compact subcategory selector with an **All services** option and every subcategory belonging to the selected category.

### R-062 — Niaz services connection

- Add **Niaz Preparation and supply** under Food & Catering.
- Show a compact **Niaz Arrangement** action inside the expanded Event drawer only; do not show it on collapsed cards.
- Selecting it opens Community Businesses Australia and filters Food & Catering to Niaz Preparation and supply in the event's metro city.

### R-063 — Justice of the Peace services

Add **Justice of the Peace (JP) Services** under Professional Services and expose it in registration and Directory subcategory filtering.

### R-064 — Server-side official ABR verification

- Replace manual administrator ABR confirmation with the official ABR Lookup web service.
- Keep the ABR authentication GUID only in Firebase Secret Manager; it must never be bundled in the APK, IPA or web client.
- Verify that the ABN passes checksum, is returned by ABR as Active, and that the submitted listing name exactly matches an ABR entity or registered business name.
- Record the official entity/business names, status, state/postcode, checked date, administrator and audit result on the private listing.
- Fail closed: an outage, inactive ABN, response mismatch or unmatched business name keeps the listing private.
- Recheck immediately before approval and clear the verification whenever an owner edits/resubmits the listing.

Implementation status: source complete in the native approval flow and shared Firebase Functions backend. Activation and live verification remain blocked until the free ABR Lookup authentication GUID is issued and saved as the `ABR_AUTH_GUID` Firebase secret.

### R-065 — Event dashboard PWA interaction alignment

- Remove the native-only **active/scoped users only** toggle from User Management.
- Present **Calendar Sync** as a pressable calendar action that filters synced users, consistent with the PWA interaction, rather than as a switch.
- Replace **Back to Overview** with the compact **« Back** action throughout the dashboard.
- Keep **Niaz Arrangement** out of collapsed Event cards and show it only as a compact action in the expanded Event drawer.

### R-066 â€” YouTube stream orientation lock

- Ask the broadcaster to choose **Portrait** or **Landscape** before mounting the native camera.
- Lock the selected orientation for preview, broadcasting and front/back camera changes so YouTube receives correctly oriented frames.
- Show the locked mode on the camera screen and return the rest of Community Connect Australia to portrait when streaming closes.
- Match the established PWA/native-wrapper YouTube-style orientation workflow.

### R-067 â€” Event action emphasis and Niaz wrapping

- Present **Go Live** as a highly visible solid-red action matching the PWA.
- Keep the Niaz action compact and render its label as exactly two lines: **Niaz** then **Arrangement**.

### R-068 — Admin event attribution and transfer workflow

- Show **Event submitted by [user] on [date]** under every event in Admin Event Management.
- Preserve the original submitter and submission date when event ownership is transferred.
- Open Transfer Event directly below the selected event card, with a two-character user search, matching-user selector and disabled confirmation until a user is selected.
- Improve long-list scrolling in My Events and Admin Event Management.

### R-069 — User-to-event admin drill-down

- Show a **View Events (count)** link on every user card in User Management.
- Open Event Management filtered to events submitted by that user when the link is selected.
- Keep administrator Edit, Copy, Delete, visibility and Transfer privileges available on those filtered event cards.

### R-070 — Expanded event drawer swipe sensitivity

- Make the top handle and header respond to a short downward drag.
- Close the drawer using either drag distance or downward velocity while preserving normal detail scrolling.
- Keep backdrop tap and the close icon as alternative close actions.

### R-071 — Go Live action size and label

- Use the same round icon-button size as the other expanded event actions.
- Keep the Go Live action prominently red and place the **Go Live** label underneath the circle, matching the other action labels.
- When the event becomes live, change that same action to the YouTube icon and **Watch on YouTube**, and open the event's YouTube live link.

### R-072 — Live-stream continuity and in-app minimising

- Allow the broadcaster to minimise an active phone-camera stream and use other areas of Community Connect Australia without unmounting the camera.
- Keep a persistent floating **Live Stream — Tap to return** control above both the Events and Business Directory modules.
- Keep the device screen awake while the phone-camera stream is active.
- Detect stream disconnection, show **Stream Interrupted**, and provide both **Resume Same Stream** and **End Live Stream** controls.
- If app backgrounding or an incoming call interrupts capture, hold the existing YouTube session until the broadcaster returns. Do not create a second YouTube broadcast; reconnect the camera to the saved session only.
- Background camera streaming is not required.

### R-073 — Prevent past event scheduling

- When adding an event, reject a date earlier than today.
- When adding an event for today, reject a start time earlier than the current time.
- Show an explanatory prompt and clear the invalid date or time, including values derived through Hijri or prayer-time selection.
- Preserve administrator access to historical dates when editing an existing event.

Implementation status: source complete; pending device verification.

### R-074 — Preserve live video during in-app minimising

- Keep the same native camera and encoder view mounted when the broadcaster minimises it inside Community Connect Australia.
- Resize that live view into the floating controller so its preview remains visible and the existing YouTube broadcast is not restarted.
- Actual app backgrounding or a phone interruption may pause capture; returning resumes the existing session rather than creating a new broadcast.

Implementation status: source complete; requires a real YouTube device-stream test.

### R-075 — Compact streaming controls and microphone meter

- Replace the large fixed bottom panel with compact, colourful camera, microphone, Go Live/End, minimise and close icon controls.
- Auto-hide the full controls after 4.2 seconds while live and reveal them when the camera surface is touched.
- Keep the PWA-styled microphone state meter visible at the right edge even when the remaining controls are hidden.

Implementation status: source complete; pending device verification.

### R-076 — Separate Business Approvals and Business Management

- Business Approvals opens the pending business/promotion review workflow.
- Businesses opens all listing statuses for search and administration, without presenting the promotion approval tabs as the same page.

Implementation status: source complete; pending device verification.

### R-077 — One-way Events Feedback

- Events Feedback is a one-way submission to the selected city admins or super admins.
- Remove reply and reaction actions and state clearly that no response is sent from this page.
- Keep Business Directory Contact Us conversations separate; those remain in Business Messaging.

Implementation status: source complete; pending device verification.

### R-078 — Icon-only sign out

- Replace the Log out text and character glyph with a clear, resolution-independent vector logout icon.
- Preserve a large accessible touch target and an accessible Log out label for screen readers.

Implementation status: source complete; pending device verification.

### R-079 — Native-safe legal document navigation

- Privacy Policy, Terms of Use and related legal pages opened from the native app must never send the user to the Community Connect Australia PWA through a **Back**, **Home** or **Back to App** link.
- When an external browser is used, identify the native-app entry context and hide all PWA **Home**, **Back to App** and similar navigation links.
- Do not use an app deep link for legal-page navigation. Users return using the device app switcher or browser/device back control.
- Apply this rule when the consolidated legal documents are implemented and before tester/store release.

Implementation status: recorded requirement; pending consolidated legal-page implementation.

### R-080 — Business workflow in-app and email notifications

- Notify the selected-city administrators and all super administrators when a user submits or resubmits a business, promotion or related changes, and when a user updates meaningful profile or notification preferences.
- Notify the listing owner, selected-city administrators and all super administrators when a business or promotion is approved or changes are requested.
- Exclude the administrator performing the decision from the administrator recipient list.
- Respect Business Directory and email notification preferences, keep SMTP credentials server-side, and expose recipient-specific updates in the native Directory notification centre.

Implementation status: native notification centre, recipient-only rules and isolated Firebase workflow functions are complete and deployed; pending end-to-end device/email verification using a test submission and approval.

### R-081 — Stable vector bottom-navigation icons

- Replace the Business Profile dot and all emoji-dependent bottom navigation glyphs with resolution-independent vector icons.
- Keep active, disabled and primary action colours consistent across Events and Business Directory navigation.

Implementation status: source complete; pending device verification.

### R-082 — Page title before controls

- Put the page title and summary at the top of Events and Business Directory Home pages.
- Place city, List/Map, Streamed Videos, Hijri Calendar, search, Open and category/service controls in a clearly separated controls section below the title.
- Keep result content in the following section and retain the same title-first hierarchy on other pages.

Implementation status: Events and Business Directory Home source complete; continuing visual review across secondary pages during device testing.

### R-083 — Red power-style logout control

- Use a round red power button with a white resolution-independent power symbol in the signed-in hamburger profile section.
- Preserve the accessible Log out label, busy state and large touch target.

Implementation status: source complete; pending device verification.

### R-084 — Business category and subcategory administration

- Add Category and Subcategory management to Business Directory Admin → Tools, matching the additive Event Type and Reciter Type workflow.
- Seed the tool from the approved Business Directory matrix and make administrator additions available immediately in Directory search and Add/Edit Business forms.
- Keep existing options non-deletable so current business records never lose their classification.
- Block duplicate Categories, Subcategories, Event Types and Reciter Types transactionally, ignoring case, spacing, punctuation and equivalent ampersand/“and” variations.
- Record the administrator UID and addition time for each new option.

Implementation status: source complete; pending device verification.

### R-085 — Store release candidate and iOS preparation

- Set the public product/store name to Community Connect Australia while preserving the Events and Business module titles in-app.
- Promote the release configuration to version 1.0.0, Android API 36 and an opaque 1024×1024 store icon.
- Ensure production builds disable tester-only behaviour and iOS App Store builds use the required iOS 26 SDK. Xcode 26.0 is pinned while the current HaishinKit livestream dependency remains in use because later Xcode 26 compilers crash while optimising HaishinKit 1.9.3.
- Keep version 1 scoped to iPhone until tablet-specific QA is completed.
- Add automated source/release checks and a documented store hand-off covering legal publication, data declarations, reviewer access, screenshots, test-data purge and company Apple signing.
- Retain Excel import/export with the current authoritative SheetJS 0.20.3 distribution rather than the obsolete npm-registry release.

Implementation status: source and production bundles complete; final real-device regression, consolidated legal publication and company Apple signing remain release gates.
