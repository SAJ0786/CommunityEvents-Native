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

function sendEventEmail(transporter, message) {
  // Preserve envelope, recipients, attachments, subjects and unsubscribe URLs.
  // The function returns the SMTP result exactly as before.
  return transporter.sendMail({
    ...message,
    ...renderEmail({ module: 'events', title: message.subject,
      bodyHtml: message.html || `<p style="white-space:pre-wrap">${escapeHtml(message.text)}</p>`,
      bodyText: message.text || textAlternative(message.html),
    }),
  });
}
module.exports = { sendEventEmail, textAlternative };
