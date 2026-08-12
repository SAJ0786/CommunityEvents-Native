# Native app PWA parity checklist

This checklist tracks the 20 device-test comments from the August 2026 Android APK review. A feature is only marked device-verified after it is exercised in an installed APK.

| # | Requirement | Implementation status | Device test |
|---|---|---|---|
| 1 | Event drawer closes by swipe-down and Close | Swipe capture works across the drawer only when content is at the top; scrolling wins once content is scrolled | Pending next APK |
| 2 | Compact PWA-like expanded event drawer | 88% maximum drawer, compact poster, icon/color actions | Pending next APK |
| 3 | Actions directly below event title | Implemented | Pending next APK |
| 4 | Poster opens full-screen and tap closes | Implemented | Pending next APK |
| 5 | Full PWA event share message | Native message mirrors PWA fields and store link block | Pending next APK |
| 6 | Poster, text-only, and copy share choices | Implemented; poster is downloaded to cache and shared as a native image file with text | Pending next APK |
| 7 | Inbox must not close app | Native Firebase messaging listeners and guarded empty/error states implemented | Pending next APK |
| 8 | Posters visible on all signed-in Home events | Fixed signed-in feed to load full Firestore events, matching PWA; guest feed remains privacy-sanitized | Pending next APK |
| 9 | Compact selectors | Shared bottom-sheet selector used for cities, form choices, recurring frequency, and Home filters | Pending next APK |
| 10 | Current-location city selection | Implemented on Home and default-city editor with permission/error handling | Pending next APK |
| 11 | Streamed Videos and Bulk Share in hamburger only | Implemented in PWA menu groups | Pending next APK |
| 12 | Working map, current location, distance | Full signed-in coordinates, markers, current location, distance, fit markers, loading/error/retry states implemented. Google key restriction corrected to the verified EAS APK SHA-1 (`BD:5C:F4:E7:FB:8E:03:AD:94:BC:18:6F:B3:04:9D:40:13:2F:D0:41`) | Pending next APK |
| 13 | Compact map time control | PWA labels in one segmented bar | Pending next APK |
| 14 | Respect camera notch/cutout | Status-bar-aware header and safe-area modal layout | Verified previously; recheck next APK |
| 15 | No refresh button; automatic updates | Pull-to-refresh removed; signed-in feed uses live Firestore listeners; guest feed refreshes silently and on foreground | Pending next APK |
| 16 | Simplified Profile sections | My Profile edit/save/delete, Share App, Help & Policies, About | Pending next APK |
| 17 | Hamburger icons | Matches PWA menu labels/icons | Pending next APK |
| 18 | Same hamburger groups as PWA | Calendar; Inbox & Feedback; Admin & Profile; Share & Search; Streamed Videos | Pending next APK |
| 19 | Modern visual treatment | Cards, sheets, segmented controls, bottom-sheet selectors, colored actions and consistent typography weights implemented | Ongoing polish after functional test |
| 20 | Visual Single/Recurring event choice | Icon-led choice cards implemented | Pending next APK |

Additional PWA parity completed in this pass:

- One-line Google Australian address autocomplete with structured address and GPS coordinates for both Single and Recurring events.
- Signed-in Home data now follows the PWA full-data path; guests continue to use the privacy-safe callable function.
- Connect to Host is wired from the expanded event drawer into Inbox conversations.
- Calendar month/week views, Hijri overlay, one-event device calendar action, and personal live calendar feed sync are implemented.
- AI Search remains intentionally deferred until the final phase as requested.
