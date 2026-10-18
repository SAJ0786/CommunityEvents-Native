'use strict';

// Explicit allowlist: this package must not replace the separately maintained
// account lifecycle, streaming or other exports in the recovered monolith.
const recovered = require('./recovered-source');
for (const name of [
  'dailyEmailReminders', 'monthlyHijriReminder', 'sendRemindersNow',
  'onReminderEmailJobCreated', 'onEventCreated', 'onEventDeleted',
  'dailyPushReminders', 'onAiReportCreated', 'sendEditOtp',
]) exports[name] = recovered[name];

Object.assign(exports, require('./notification-matrix').register());
Object.assign(exports, require('./queued-email').register());

// Profile-completion writer owns welcome/admin signup notices; retain old trigger identity without duplicate mail.
exports.onUserCreated = require('firebase-functions/v2/firestore').onDocumentCreated({ document: 'users/{uid}', region: 'australia-southeast1' }, async () => null);
