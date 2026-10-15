# Promotion audience — code candidate, not deployed

## User decisions and implemented behaviour

- Business requests `requestedAudience: local | australia`; absent means local.
- Native form explains that nationwide offers must be usable throughout Australia.
- Admin explicitly confirms audience, may narrow nationwide to local, but cannot
  broaden a local request. Existing central admin promotion-review permissions are
  retained (not changed to city-scoped administration).
- App Check callable `approvePromotionAudience` atomically approves the promotion,
  sanitises its public projection, records audit and writes a server-only audience
  proof bound to the exact approval timestamp and business city.
- Owner-supplied `approvedAudience` cannot authorise nationwide delivery. Workers
  read the server-only proof and recheck it before sending.
- Announcements happen immediately on approval, even with future start dates.
  Future offers still become visible in the active feed on their start date.
- One campaign per promotion lifetime. Edits/reapproval do not rebroadcast or add
  another audience to an already queued/sent campaign. Create a new promotion for
  a genuinely new campaign; do not delete delivery history to force resends.
- Local email retains existing behaviour with flags off. Opted-in push and national
  audiences require the server flag. Email and push each require explicit channel
  and business-notification preferences; missing preferences are not consent.
- National recipients must have a recognised enabled Australian city selection.
  Unknown/disabled/missing cities, inactive/migrated users and opt-outs are excluded.
- Delivery rechecks current eligibility, approval, city, audience and expiry.
  Claims prevent automatic resend of uncertain SMTP/FCM outcomes; failures enter
  review-required. This does not promise exactly-once delivery by external providers.
- Native public promotion feed recognises approved Australia-wide offers across
  selected cities and labels them accordingly. Existing default local offers unchanged.

## Deliberately inactive / item 4 later

- `PROMOTION_AUDIENCE_CLIENT_ENABLED=true` exposes new native controls/callable path.
- `PROMOTION_AUDIENCE_ENABLED=true` enables server approval, broad audience and push.
- Neither enabled, no builds/deploys/sends, no historical campaigns backfilled.
- Owner rule source includes optional requestedAudience validation/edit permission.
  Its deployment and merged security acceptance remain item 4, not done here.
- Server-only promotionAudienceApprovals is denied by default in current rules.
  Verify this with production-equivalent emulator rules before activation.
- Review provider delivery monitoring, real SMTP/FCM, App Check and device flows
  with item 4. New push uses the existing directory notification route and channel.
- Campaign push claims create the matching bell entry atomically. Deploy the updated
  generic business push worker (which skips promotion.announcement) before enabling
  campaign push, otherwise an older generic worker could send a duplicate.
- PWA chat receives this contract and owns its corresponding UI integration.

## Existing cities / coordinates

Sydney, Melbourne, Canberra, Brisbane, Adelaide, Hobart and Perth already have
numeric latitude/longitude plus IANA timezone in BUNDLED_CITY_CATALOGUE. The server
copies and native clients share this schema. Initial catalogue creation through
Add City stores all these existing entries along with the new city, never only
the new one. Existing valid remote catalogue entries are preserved. A malformed
remote catalogue is rejected, not overwritten. A regression test checks coordinate
and timezone fields for every real city in the saved result.

Rest of Australia is intentionally an aggregate with null coordinates and no
single timezone. It must not be used as an exact venue/prayer location. No live
catalogue seeding/migration was performed; that remains controlled release work.

## Verification

27 city/audience/email tests passed with synthetic data; 14 existing regression
scripts passed. Source check parsed 124 JS files. No live data or delivery used.
See scripts/test-promotion-audience.cjs and scripts/test-promotion-email.cjs.
