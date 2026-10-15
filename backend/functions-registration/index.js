// Separate codebase: not added to production firebase.json until emulator/security review.
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { createRegistrationHandlers } = require('./registration');
const { createPosterMaintenance } = require('./posterMaintenance');
admin.initializeApp();
const handlers = createRegistrationHandlers({ db: admin.firestore(), bucket: admin.storage().bucket(), HttpsError,
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' });
for (const [name, handler] of Object.entries(handlers)) {
  exports[name] = onCall({ region: 'australia-southeast1', enforceAppCheck: true, maxInstances: 5 }, handler);
}
// Candidate only. Not in production Firebase config; explicit feature gate applies.
const sweepPosters = createPosterMaintenance({ db: admin.firestore(), bucket: admin.storage().bucket(),
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' });
exports.cleanupRegistrationPosters = onSchedule({ schedule: 'every 60 minutes', region: 'australia-southeast1', maxInstances: 1 }, async () => {
  const result = await sweepPosters();
  logger.info('Registration poster cleanup summary', result); // Counts only; no paths, users or form answers.
});
