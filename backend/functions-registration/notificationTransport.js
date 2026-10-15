'use strict';
// No new public URLs or unverified app schemes. Email gives explicit in-app steps;
// push carries the private record ID, which is authorised again by the callable.
function createNotificationTransport({ mailer, messaging, from }) {
  return {
    sendEmail: (email, notice) => mailer.sendMail({
      from, to: email, subject: notice.title,
      text: `${notice.body}\n\nIn Community Connect Australia, choose Events, then Browse registration only events, then My registrations and open your event.\n\nThis is a service message about an event you registered for, not a promotional email.`,
      messageId: `<registration-${notice.noticeId}@siza.info>`,
    }),
    sendPush: async (tokens, notice) => {
      let needsReview = false;
      for (let offset = 0; offset < tokens.length; offset += 500) {
        const response = await messaging.sendEachForMulticast({
          tokens: tokens.slice(offset, offset + 500), notification: { title: notice.title, body: notice.body },
          data: { module: 'registration', type: 'registration.changed', eventId: notice.eventId,
            notificationId: notice.noticeId, recipientUid: notice.recipientUid },
          android: { priority: 'high', notification: { channelId: 'business-alerts', tag: notice.noticeId, sound: 'default' } },
          apns: { headers: { 'apns-collapse-id': notice.noticeId, 'apns-priority': '10', 'apns-push-type': 'alert' }, payload: { aps: { sound: 'default' } } },
        });
        // Provider rejections are explicit, but do not resend successes in a mixed
        // batch. Operators can inspect aggregate delivery state before retrying.
        if (response.failureCount > 0) needsReview = true;
      }
      return { needsReview };
    },
  };
}
module.exports = { createNotificationTransport };
