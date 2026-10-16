// Separate codebase: not added to production firebase.json until emulator/security review.
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const { defineSecret } = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const { createChangeNotifications } = require('./changeNotifications');
const { createNotificationTransport } = require('./notificationTransport');
const { createRegistrationHandlers } = require('./registration');
const { createPosterMaintenance } = require('./posterMaintenance');
const { createAccountCleanup, deleted } = require('./accountCleanup');
admin.initializeApp();
const handlers = createRegistrationHandlers({ db: admin.firestore(), bucket: admin.storage().bucket(), HttpsError,
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' });
for (const [name, handler] of Object.entries(handlers)) {
  exports[name] = onCall({ region: 'australia-southeast1', enforceAppCheck: false, maxInstances: 5 }, handler);
}
// Candidate only. Not in production Firebase config; explicit feature gate applies.
const sweepPosters = createPosterMaintenance({ db: admin.firestore(), bucket: admin.storage().bucket(),
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' });
exports.cleanupRegistrationPosters = onSchedule({ schedule: 'every 60 minutes', region: 'australia-southeast1', maxInstances: 1 }, async () => {
  const result = await sweepPosters();
  logger.info('Registration poster cleanup summary', result); // Counts only; no paths, users or form answers.
});
const smtp = Object.fromEntries(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'].map(name => [name, defineSecret(name)]));
exports.deliverRegistrationChanges = onSchedule({ schedule: 'every 1 minutes', region: 'australia-southeast1', maxInstances: 1,
  timeoutSeconds: 540, secrets: Object.values(smtp) }, async () => {
  // Separate delivery gate prevents a backend-only rollout from notifying users
  // before their native/PWA clients can open and edit a registration.
  if (process.env.EVENT_REGISTRATION_ENABLED !== 'true' || process.env.EVENT_REGISTRATION_NOTICES_ENABLED !== 'true') return;
  const config = Object.fromEntries(Object.entries(smtp).map(([name, secret]) => [name, secret.value()]));
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) throw Error('Registration SMTP is not configured.');
  const port = Number(config.SMTP_PORT || 587);
  const mailer = nodemailer.createTransport({ host: config.SMTP_HOST, port, secure: port === 465,
    connectionTimeout: 10000, socketTimeout: 15000, auth: { user: config.SMTP_USER, pass: config.SMTP_PASS } });
  const transport = createNotificationTransport({ mailer, messaging: admin.messaging(), from: { name: 'Community Connect Australia', address: 'support@siza.info' } });
  const worker = createChangeNotifications({ db: admin.firestore(), enabled: () => true, ...transport });
  logger.info('Registration change delivery summary', await worker.tick());
});
const accountCleanup = createAccountCleanup({ db: admin.firestore(),
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' || process.env.EVENT_REGISTRATION_MAINTENANCE_ENABLED === 'true' });
exports.queueRegistrationAccountCleanup = onDocumentWritten({ document: 'users/{uid}', region: 'australia-southeast1', retry: true }, async event => {
  if (deleted(event.data?.after.data())) await accountCleanup.enqueue(event.params.uid);
});
exports.cleanupRegistrationAccounts = onSchedule({ schedule: 'every 1 minutes', region: 'australia-southeast1', maxInstances: 1 }, async () => {
  logger.info('Registration account cleanup summary', await accountCleanup.tick());
});
