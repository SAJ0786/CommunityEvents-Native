# Business Inbox notifications: release and device checks

## Behaviour

- Each customer message creates a business-owner bell alert and push, and an email to the business listing's contact email. No personal-owner-email fallback.
- Each owner reply creates a customer bell alert and push, and an email to the customer's account email. Without an email address, bell and push still work.
- Private conversation alerts are never copied to city admins or super admins. Business ownership and active recipient status are checked. Email jobs recheck ownership and recipient addresses before sending.
- Explicit business problem reports notify the relevant city admins and super admins by bell/push and email; they are separate from ordinary private enquiries.
- Enquiries/replies, review submissions, approvals, requested changes, listing archive/deletion and moderation decisions are required service alerts. They bypass optional business/push/email switches, but cannot bypass phone OS notification permissions or unavailable addresses/tokens.
- Ordinary updates such as profile-change alerts respect business/push/email opt-outs. Existing false settings are preserved. New profiles default push/email, event/business updates, prayer reminders and reminder/admin emails to on. SMS delivery is not introduced or changed.
- Private message text is excluded from push payloads; emails contain the message. Replies to notification emails go to support@siza.info, not into the app conversation. The email copy instructs recipients to reply in Business Inbox.
- Push jobs store delivery state in `businessPushDeliveries`, retry transient failures (up to five attempts), and track completed devices. Provider acceptance is not proof of phone display. As with SMTP/FCM generally, an ambiguous network failure can still produce a duplicate; exactly-once external delivery is not guaranteed.

## Required before production

1. Run `npm ci` in this native directory (including its existing postinstall patches). Messaging 26.1.0 must match Firebase app 26.1.0. Do not attempt an OTA-only release: this adds a native module.
2. Firebase Console -> Project settings -> Cloud Messaging -> production iOS app `info.siza.communityevents`: confirm an APNs authentication key (or appropriate valid APNs certificates), matching Apple Team ID/key details. Do not commit or share private keys in Git.
3. In Apple Developer, confirm Push Notifications capability for that exact bundle ID, and refresh the distribution provisioning profile if needed. TestFlight uses production APNs. Personal-test builds require the separate matching app/bundle configuration.
4. Build a new TestFlight/iOS binary and Android test build. The app config includes the messaging plugin, production `aps-environment` entitlement and remote-notification background mode. Development-signed builds may require the development APNs entitlement for their provisioning profile.
5. Deploy only the reviewed business-workflow codebase using the backend config, **not the native root firebase.json**. The root file is RNFirebase runtime configuration, not Firebase CLI deployment configuration:

   ```powershell
   firebase.cmd deploy --only functions:business-workflow --project community-event-8b639 --config backend/firebase.json
   ```

   This updates `queueBusinessEnquiryEmail`, workflow handlers and email delivery, and adds `deliverBusinessPush` and `nativeBusinessModerationNoticeCreated`. It does not deploy PWA, Hosting or security rules. Do not deploy only the new push worker with an old workflow sender: this could double-send workflow pushes during mixed-version operation. Use a quiet release window and verify the entire codebase deployment succeeds.

## Acceptance checks (real devices required)

- Tester -> Phoenix: owner gets Business Inbox unread count, bell alert, phone push and contact-email message. Phoenix -> Tester: customer gets all four (when an account email exists). Test a follow-up in each direction.
- Test iPhone and Android while foreground, background and locked. Tap alerts: private messages open Business Inbox; workflow alerts open Notifications.
- Switch optional updates off: enquiries/replies and admin decisions still deliver. Ordinary updates do not. Deny OS permission: no phone push; email/in-app remain.
- Approve, reject and archive a synthetic business listing: owner and relevant city admins/super admins are notified, excluding the actor. Test promotion approval/rejection too. Do not use real listings for test closures.
- Sign out and switch accounts on one device: the old account's token is unlinked/invalidated; an alert for another account must not navigate to its conversation.
- Check Functions logs plus `businessPushDeliveries` and `supportEmailOutbox` statuses. Missing-token/address skips are diagnostic states, not successful delivery.

Local automated tests mock external services; they do not establish that APNs credentials or a signed iOS build are working.
