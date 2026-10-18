'use strict';
const { renderEmail, escapeHtml } = require('./email-template');

// This consumes only the trusted HTML produced by the templates in this
// backend. User values must be escaped where those templates are assembled.
function textAlternative(html) {
  return String(html || '')
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(?:p|div|tr|h[1-6])>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(?:039|39);/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}

// Fixed destinations only: notification data cannot inject a button URL.
const APP_DESTINATIONS = Object.freeze([['Explore Community Connect', 'https://download.communityconnect.siza.info']]);
function welcomeEmailBody(name) {
  return `Welcome ${String(name || '').trim()} to Community Connect Australia.\nDiscover local community events and connect with trusted businesses.\nFind what’s on near you, register and stay connected.\nExplore the app by clicking the button below.`;
}
function registrationEmailContent(body) {
  // Older queued welcome messages contain this URL in their body too.
  const message = String(body ?? '').replace(/https:\/\/communityconnect\.siza\.info\/?/g, '').trim();
  return {
    text: `${message}\n\n${APP_DESTINATIONS.map(([label,url]) => `${label}: ${url}`).join('\n')}\nContact support@siza.info for assistance.`,
    html: `<p style="white-space:pre-wrap">${escapeHtml(message)}</p><table role="presentation" cellspacing="0" cellpadding="0">${APP_DESTINATIONS.map(([label,url]) => `<tr><td style="padding:0 0 10px"><a data-app-button href="${escapeHtml(url)}" style="display:inline-block;background:#138477;border:1px solid #138477;border-radius:8px;padding:12px 20px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;text-align:center">${escapeHtml(label)}</a></td></tr>`).join('')}</table><p>Contact support@siza.info for assistance.</p>`,
  };
}

function sendEventEmail(transporter, message) {
  const rendered = renderEmail({ module: 'events', title: message.subject,
    bodyHtml: message.html || `<p style="white-space:pre-wrap">${escapeHtml(message.text)}</p>`,
    bodyText: message.text || textAlternative(message.html),
  });
  // Preserve envelope, recipients, attachments, subjects and unsubscribe URLs.
  // The function returns the SMTP result exactly as before.
  return transporter.sendMail({
    ...message,
    ...rendered,
    attachments: [...(message.attachments || []), ...rendered.attachments],
  });
}
module.exports = { sendEventEmail, textAlternative, registrationEmailContent, welcomeEmailBody };
