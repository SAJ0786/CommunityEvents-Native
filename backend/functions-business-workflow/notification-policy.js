'use strict';

// Service messages are not marketing subscriptions. OS permission still applies.
const REQUIRED_TYPES = new Set([
  'business-enquiry', 'business-reply', 'business.reported',
  'business.submitted', 'business.resubmitted', 'business.approved', 'business.changes_requested',
  'business.archived', 'business.deleted', 'business.moderated',
  'promotion.submitted', 'promotion.resubmitted', 'promotion.approved', 'promotion.changes_requested', 'promotion.deleted',
]);
const isActiveRecipient = user => Boolean(user) && user.active !== false && user.isActive !== false
  && !['archived', 'banned', 'deleted'].includes(user.accountStatus);
const isRequired = type => REQUIRED_TYPES.has(type);
function allowsNotification(user, type, channel = 'inApp') {
  if (!isActiveRecipient(user)) return false;
  if (isRequired(type)) return true;
  if (user.businessNotificationsEnabled === false) return false;
  return channel === 'push' ? user.pushNotificationsEnabled !== false
    : channel === 'email' ? user.emailNotificationsEnabled !== false : true;
}
function fcmTokens(user = {}) {
  const value = user.fcmTokens;
  return [...new Set((Array.isArray(value) ? value : Object.keys(value || {})).filter(token => typeof token === 'string' && token.trim()))];
}
module.exports = { isActiveRecipient, isRequired, allowsNotification, fcmTokens };
