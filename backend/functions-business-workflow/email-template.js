'use strict';

// One email shell for workflow updates, enquiries and support reports.
// Keep all user-supplied values escaped before inserting body HTML.
const SUPPORT_EMAIL = 'support@siza.info';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const emailBrand = module => module === 'events' ? 'Community Connect | Events'
  : module === 'directory' ? 'Community Connect | Business Directory' : 'Community Connect';

function renderEmail({ module, title, bodyHtml, bodyText }) {
  const brand = emailBrand(module);
  const footer = `This is an automated update from ${brand}. Replies are sent to ${SUPPORT_EMAIL}.`;
  return {
    text: `${brand}\n${title}\n\n${bodyText}\n\n${footer}`,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f7f6;font-family:Arial,sans-serif;color:#10172f;font-size:16px;line-height:1.6"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f6"><tr><td style="padding:16px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" align="center" style="max-width:620px;margin:0 auto;border:1px solid #d7e4e1;border-radius:14px;background:#ffffff;overflow:hidden;table-layout:fixed"><tr><td style="padding:20px;background:#138477;color:#ffffff;border-radius:14px 14px 0 0;overflow-wrap:anywhere;word-wrap:break-word"><div data-email-brand style="font-size:20px;line-height:1.35;font-weight:600">${escapeHtml(brand)}</div><h1 style="margin:10px 0 0;font-size:18px;line-height:1.35;font-weight:700;color:#ffffff">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:20px;font-size:16px;line-height:1.6;overflow-wrap:anywhere;word-wrap:break-word">${bodyHtml}<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e3ecea;color:#64727c;font-size:13px;line-height:1.55">${escapeHtml(footer)}</div></td></tr></table></td></tr></table></body></html>`,
  };
}

function detailRows(details) {
  return `<table width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;font-size:16px;line-height:1.5">${details.map(([label, value]) => `<tr><th scope="row" width="34%" style="text-align:left;padding:7px 10px 7px 0;vertical-align:top;font-weight:600;overflow-wrap:anywhere">${escapeHtml(label)}</th><td style="padding:7px 0;vertical-align:top;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</td></tr>`).join('')}</table>`;
}

function buildWorkflowEmail(notification) {
  return renderEmail({
    module: notification.module || 'directory', title: notification.title,
    bodyText: notification.body,
    bodyHtml: `<p style="margin:0;white-space:pre-wrap">${escapeHtml(notification.body)}</p>`,
  });
}

module.exports = { SUPPORT_EMAIL, emailBrand, escapeHtml, renderEmail, detailRows, buildWorkflowEmail };
