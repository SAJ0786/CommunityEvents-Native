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
    assert.match(email.html, /font-size:16px/);
    assert.match(email.html, /<h1 style="[^"]*font-size:18px/);
    assert.match(email.html, /data-email-brand style="font-size:20px/);
    assert.ok(18 < 20, 'subject title must be smaller than the brand line');
    assert.match(email.html, /border-radius:14px/);
    assert.match(email.html, /support@siza.info/);
    assert.doesNotMatch(email.html, /Community Businesses Australia|Community Events Sydney|<h1>/);
    assert.ok(email.html.indexOf('data-email-brand') < email.html.indexOf('<h1'));
  }
  const hostile = buildEmail({ kind: 'business-report', businessName: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>', senderName: '<b>Fake</b>' }, '<reference>');
  assert.doesNotMatch(hostile.html, /<script|<img|<b>/);
  assert.match(hostile.html, /&lt;img/);
  assert.match(hostile.html, /&lt;reference&gt;/);
  const workflow = fs.readFileSync(path.join(root, 'backend/functions-business-workflow/index.js'), 'utf8');
  assert.match(workflow, /\.\.\.buildWorkflowEmail\(notification\)/);
  assert.doesNotMatch(workflow, /html: `|font-size:25px/);
  // Exercise the real delivery body as well as its template. This catches
  // undefined envelope variables that a standalone rendering test cannot see.
  const statements = require('@babel/parser').parse(workflow, { sourceType: 'script' }).program.body;
  const deliveryCode = statements.filter(node =>
    (node.type === 'FunctionDeclaration' && ['clean', 'uniqueRecipients', 'deliver'].includes(node.id.name)) ||
    (node.type === 'VariableDeclaration' && node.declarations.some(item => item.id.name === 'SUPPORT_EMAIL'))
  ).map(node => workflow.slice(node.start, node.end)).join('\n');
  const sent = [];
  const context = {
    buildWorkflowEmail, sender: () => 'support@siza.info',
    buildTransporter: () => ({ sendMail: async email => { sent.push(email); return { messageId: 'synthetic' }; } }),
    db: { batch: () => ({ set() {}, commit: async () => {} }), collection: () => ({ doc: () => ({}) }) },
    admin: { firestore: { FieldValue: { serverTimestamp: () => 0 } } },
    logger: { info() {}, warn() {}, error(message) { throw new Error(message); } },
  };
  require('node:vm').runInNewContext(deliveryCode, context);
  await context.deliver([{ uid: 'synthetic-user', email: 'recipient@example.test', pushNotificationsEnabled: false }],
    { type: 'test', title: 'Business changes submitted', body: 'Synthetic delivery test' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].replyTo, 'support@siza.info');
  assert.equal(sent[0].to, 'recipient@example.test');

  if (process.argv.includes('--render')) {
    const { chromium } = require('playwright');
    const output = path.join(root, '.tools/email-layout-preview');
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: process.env.EMAIL_PREVIEW_BROWSER || undefined });
    try {
      const page = await browser.newPage();
      for (const [name, email] of Object.entries(samples)) {
        fs.writeFileSync(path.join(output, name + '.html'), email.html);
        for (const width of [320, 393, 800]) {
          await page.setViewportSize({ width, height: 850 });
          await page.setContent(email.html);
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
