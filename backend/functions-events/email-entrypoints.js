'use strict';

// Explicit allowlist: this package must not replace the separately maintained
// account lifecycle, streaming or other exports in the recovered monolith.
const recovered = require('./recovered-source');
for (const name of [
  'dailyEmailReminders', 'monthlyHijriReminder', 'sendRemindersNow',
  'onReminderEmailJobCreated', 'onEventCreated', 'onEventDeleted',
  'onUserCreated', 'onAiReportCreated', 'sendEditOtp', 'sendPrivateStreamLinkEmail',
]) exports[name] = recovered[name];
