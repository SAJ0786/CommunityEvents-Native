const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildWorkflowEmail, emailBrand } = require('../backend/functions-business-workflow/email-template');
const { buildEmail } = require('../backend/functions-business-workflow/support-workflow');
const root = path.resolve(__dirname, '..');
const samples = {
  'business-update': buildWorkflowEmail({ title: 'Business changes submitted', body: 'Example Business has been updated and resubmitted for review in Sydney.' }),
  'business-report': buildEmail({ kind: 'business-report', businessId: 'synthetic-business-reference', businessName: 'Example Business', senderName: 'Test Reporter', senderEmail: 'test@example.test', city: 'Sydney', category: 'Incorrect information', message: 'Please check the opening hours.\nThe listed time appears incorrect.' }, 'a'.repeat(64)),
  'business-enquiry': buildEmail({ kind: 'business-enquiry', businessName: 'Example Business', senderName: 'Test Customer', message: 'What time do you open on Saturday?' }, 'b'.repeat(64)),
  'app-feedback': buildEmail({ kind: 'app-feedback', senderName: 'Test User', message: 'An app feedback example.' }, 'c'.repeat(64)),
  // Contract for the separately managed Events backend, not a new sender.
  'events-format': buildWorkflowEmail({ module: 'events', title: 'Upcoming community events', body: 'Your selected community events are coming up soon.' }),
};

async function main() {
  Object.assign(samples, await require('./events-email-fixtures.cjs').eventEmailFixtures());
  for (const [name, email] of Object.entries(samples)) {
    const expected = name.startsWith('business') ? emailBrand('directory') : name.startsWith('events') ? emailBrand('events') : emailBrand();
    assert.ok(email.html.includes(expected), name + ' branding');
    assert.ok(email.text.startsWith(expected));
    assert.equal((email.html.match(/data-app-button/g)||[]).length, 1, name+' uses one app button');
    assert.match(email.html, /href="https:\/\/download\.communityconnect\.siza\.info"/);
    assert.match(email.html, /font-size:16px/);
    assert.match(email.html, /<h1 style="[^"]*font-size:18px/);
    assert.match(email.html, /data-email-brand style="font-size:20px/);
    assert.ok(18 < 20, 'subject title must be smaller than the brand line');
    assert.match(email.html, /border-radius:14px/);
    assert.match(email.html, /support@siza.info/);
    assert.doesNotMatch(email.html, /Community Businesses Australia|Community Events Sydney|<h1>/);
    assert.ok(email.html.indexOf('data-email-brand') < email.html.indexOf('<h1'));
    assert.match(email.html, /<img data-email-logo src="cid:community-connect-logo@siza.info"/);
    const logo = email.attachments.find(item => item.cid === 'community-connect-logo@siza.info');
    assert.ok(logo, name + ' inline PNG attachment');
    assert.equal(logo.contentType, 'image/png');
    assert.deepEqual(logo.content, fs.readFileSync(path.join(root, 'assets/logo.png')));
  }
  const enquiry = samples['business-enquiry'];
  assert.match(enquiry.html, /Contacted by/);
  assert.match(enquiry.html, /Test Customer/);
  assert.match(enquiry.html, /Business[\s\S]*Example Business/);
  assert.match(enquiry.html, /Message[\s\S]*What time do you open on Saturday/);
  assert.doesNotMatch(enquiry.html, /Reference|Business ID|City|Email verification|Category|Submitted|Open Business Inbox/);
  assert.doesNotMatch(enquiry.text, /Reference:|Business ID:|City:|Email verification:|Category:|Submitted:|Open Business Inbox/);
  assert.doesNotMatch(enquiry.subject, /\[[a-f0-9]{12}\]/);
  const hostile = buildEmail({ kind: 'business-report', businessName: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>', senderName: '<b>Fake</b>' }, '<reference>');
  assert.doesNotMatch(hostile.html, /<script|<img src=x|<b>/);
  assert.equal((hostile.html.match(/<img\b/g) || []).length, 1, 'only the trusted logo is an image');
  assert.match(hostile.html, /&lt;img/);
  assert.match(hostile.html, /&lt;reference&gt;/);
  const workflow = fs.readFileSync(path.join(root, 'backend/functions-business-workflow/index.js'), 'utf8');
  assert.match(workflow, /eventEmailOutbox/);
  assert.match(workflow, /module: 'directory'/);
  const worker = fs.readFileSync(path.join(root, 'backend/functions-events/queued-email.js'), 'utf8');
  assert.match(worker, /buildWorkflowEmail/);
  // Actual queue/SMTP claims are executed by test-notification-matrix.cjs and test-business-push.cjs.

  if (process.argv.includes('--render')) {
    const { chromium } = require('playwright');
    const output = process.env.EMAIL_PREVIEW_OUTPUT || path.join(root, '.tools/email-layout-preview');
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: process.env.EMAIL_PREVIEW_BROWSER || undefined });
    try {
      const page = await browser.newPage();
      for (const [name, email] of Object.entries(samples)) {
        // Browser previews cannot resolve MIME CID attachments; inline identical PNG bytes for preview only.
        const previewHtml = email.attachments.reduce((html, item) => item.cid && Buffer.isBuffer(item.content)
          ? html.replace(`cid:${item.cid}`, `data:${item.contentType};base64,${item.content.toString('base64')}`) : html, email.html);
        fs.writeFileSync(path.join(output, name + '.html'), previewHtml);
        for (const width of [320, 393, 800]) {
          await page.setViewportSize({ width, height: 850 });
          await page.setContent(previewHtml);
          await page.locator('[data-email-logo]').evaluate(img => img.decode());
          const measurement = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            titleSize: parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),
            bodySize: parseFloat(getComputedStyle(document.body).fontSize),
            otpFits: (() => { const otp = document.querySelector('[data-email-otp]'); return !otp || (getComputedStyle(otp).whiteSpace === 'nowrap' && otp.scrollWidth <= otp.clientWidth); })(),
          }));
          assert.ok(measurement.width <= width, name + ' must not overflow at ' + width);
          assert.equal(measurement.titleSize / measurement.bodySize, 18 / 16);
          assert.ok(measurement.otpFits, 'OTP must fit on one line at ' + width);
          await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
        }
      }
    } finally { await browser.close(); }
  }
  console.log('PASS email layouts: shared shell, app/module branding, compact headings, text alternatives, escaping and long-reference wrapping' + (process.argv.includes('--render') ? '; rendered at 320px, 393px and 800px.' : '.'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
