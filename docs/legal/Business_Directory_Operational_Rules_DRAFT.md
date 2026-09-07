# Community Businesses Australia Directory Listing and Operational Rules — pre-launch draft

Document version: `draft-2026-09-06-community-connect`

Prepared: 6 September 2026

Contact: support@siza.info

Website: https://siza.info


This internal launch pack supports the consolidated Privacy Policy and Terms. It must be legally and operationally reviewed and converted to versioned public documents before real users or real business data are accepted.

## Listing rules

- The submitter must confirm authority, accuracy and permission to publish supplied contacts/images.
- ABN is optional. If supplied, approval requires an active official ABR record and a reasonable entity/business-name match. Without an ABN, no verification badge appears.
- No claim is made about identity, ownership, licences, qualifications, insurance, quality, safety or legal compliance.
- Owners choose either full public storefront address or suburb/service-area display. Home/mobile-service addresses default to suburb-level public display.
- Prohibited listings include unlawful, deceptive, infringing, unsafe, discriminatory or unauthorised content.
- Sponsored/promoted content is labelled and follows the same content rules.
- Acceptance records the current Privacy Policy, Terms and Listing Rules version with a timestamp.

## Enquiries and email

- Contact Business messages are routed privately and must not expose private owner data in the public listing.
- Users must not send passwords, verification codes, financial details, sensitive identity information, abuse, spam or unlawful content.
- Automated workflow email is sent through AWS SES from `support@siza.info`; replies are also directed to `support@siza.info`.
- Failed delivery, complaints and email or notification preferences must be logged and handled consistently.

## Complaints, takedown and appeals

1. Record the report, reporter, listing/message reference, reason, time and privacy-minimised evidence.
2. Triage urgent safety/legal risks and hide content where proportionate.
3. Notify the owner of the issue unless doing so creates a safety/legal risk.
4. Record the authorised decision and reason in an audit log.
5. Allow an owner to provide corrections or appeal; a different authorised reviewer should handle contested decisions where practicable.
6. Restore, amend, retain hidden or remove content and notify affected parties as appropriate.
7. Direct privacy, support and appeal correspondence to `support@siza.info`.

## Permanent archive policy for legal review

- Unsubmitted local form data: not uploaded.
- Business listings, promotions, users, events, reports and moderation decisions are never hard-deleted through an app workflow. They move to restricted archives with their action reason and audit history.
- Withdrawn, archived or deleted public projections are removed promptly; the complete private source record is retained permanently for Super Admin review.
- A new business submission is compared with all archived/deleted business history, with no time limit. Any match by ABN, verified address, or strong name/contact identifiers requires an explicit administrator eligibility review before approval.
- Account deletion disables authentication and archives the profile and calendar subscription. Ban records remain permanent even after an authorised unban.
- Uploaded content and diagnostics follow the same archive-first rule unless a provider controls the record independently.

This permanent-retention position requires Australian privacy/legal review, clear owner/user notices, access restrictions, documented restoration authority and auditable outcomes before production launch.

## Release gates

- No real Business Directory data in pre-store tester builds.
- Firebase public/private rules deployed and tested; approved data migrated to sanitised projections.
- Final signing certificates registered for Firebase phone authentication and Google Maps.
- Consolidated legal documents versioned and published; login and listing consent versions updated.
- Operator identity, privacy contact, complaints contact and emergency escalation path populated; app, PWA, store and public pages use `support@siza.info` and the main SIZA website link uses https://siza.info.
- AWS SES production identity, sender and reply-to are verified as `support@siza.info`, and a monitored mailbox receives replies.
- Archive/restore jobs, historical-business matching, report/appeal workflow and production monitoring verified.
