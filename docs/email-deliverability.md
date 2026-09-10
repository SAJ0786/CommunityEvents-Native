# Transactional email deliverability

Business Directory update emails are sent by the Firebase business workflow
functions using `support@siza.info` as the authenticated sender and reply-to
address. The function marks these messages as automated transactional updates;
it does not add marketing unsubscribe links because these messages are
account-related notifications controlled by the user's notification settings.

To improve delivery, the SMTP provider and DNS owner must verify all of the
following for `siza.info`:

- SPF authorises the SMTP provider that is used by `SMTP_HOST`.
- DKIM is enabled in the provider and the provider's selector public key is
  published in DNS.
- DMARC is published (start with `p=none`, then tighten after reviewing
  aggregate reports) and aligns the visible `From` domain with the
  authenticated sender.
- The provider has verified `support@siza.info` and the domain, and its
  reverse-DNS/HELO identity is configured.
- The sending IP/domain has no reputation or block-list issue.

These DNS and provider changes cannot be made from the mobile app or Firebase
source code. If the provider supplies a dedicated transactional sender (for
example `updates@siza.info`), update `BUSINESS_FROM_ADDRESS` and
`EMAIL_REPLY_TO` together only after that identity is verified by the
provider.
