// Separate codebase: not added to production firebase.json until emulator/security review.
const admin = require('firebase-admin');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { createRegistrationHandlers } = require('./registration');
admin.initializeApp();
const handlers = createRegistrationHandlers({ db: admin.firestore(), bucket: admin.storage().bucket(), HttpsError,
  enabled: () => process.env.EVENT_REGISTRATION_ENABLED === 'true' });
for (const [name, handler] of Object.entries(handlers)) {
  exports[name] = onCall({ region: 'australia-southeast1', enforceAppCheck: true, maxInstances: 5 }, handler);
}
