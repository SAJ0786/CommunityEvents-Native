# Community Businesses Australia — Message Routing Matrix

This matrix keeps Business Directory communication separate from Community Events feedback and inboxes.

| User action | Recipient | User sees it in | Administrator/owner sees it in | Data route | Notes |
|---|---|---|---|---|---|
| Contact Business | The selected business listing owner | Business Inbox | Business Inbox of the listing owner | `businessMessageThreads` | Private two-party conversation. Directory administrators do not automatically receive it. |
| Report a Business | Business Directory administrators for the selected city; Super Admin can review all | Business Feedback | Business Admin Dashboard → Business Messaging | `adminFeedbackThreads` with `module: business`, `category: business-report` | Kept confidential from the reported business. Never appears in Events Feedback. |
| Contact Us | Business Directory administrators for the selected city; Super Admin can review all | Business Feedback | Business Admin Dashboard → Business Messaging | `adminFeedbackThreads` with `module: business`, `category: directory-contact` | Used for directory support, listing, legal/privacy and technical questions. Never appears in Events Feedback. |
| Events Feedback | Event city administrators; Super Admin can review all | Events Feedback | Events Admin → Feedback | `adminFeedbackThreads` with `module: events` | Separate from every Business Directory route. |
| Contact Event Host | The selected event host | Events Inbox | Events Inbox of the host | `hostMessageThreads` | Separate private event conversation. |

## Navigation labels

- **Business Inbox:** customer-to-business-owner conversations created by **Contact Business**.
- **Business Feedback:** the sender’s Business reports and Contact Us conversations; administrators see the Business support queue.
- **Business Messaging:** the Business Admin Dashboard queue for Business reports and Contact Us messages.
- **Events Feedback:** Events module feedback only.

## Privacy rule

A Business report must not be delivered to the reported business owner. Only authorised directory administrators and the sender can read that support thread.
