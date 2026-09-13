const admin      = require("firebase-admin");
const nodemailer = require("nodemailer");
const { sendEventEmail } = require("./email-layout");
const { detailRows } = require("./email-template");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");
const sharp      = require("sharp");
const { URL }    = require("url");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { defineSecret }      = require("firebase-functions/params");

admin.initializeApp();
const db = admin.firestore();

const REGION = "australia-southeast1";
const SES_SNS_TOPIC_ARN = defineSecret("SES_SNS_TOPIC_ARN");

function pushNotificationsEnabled(user = {}) {
  if (user.pushNotificationsEnabled !== undefined) return user.pushNotificationsEnabled !== false;
  return user.reminderEmailEnabled !== false;
}

function getUserFcmTokens(user = {}) {
  const stored = user.fcmTokens;
  if (!stored) return [];
  if (Array.isArray(stored)) return stored.filter(Boolean);
  if (typeof stored === "object") return Object.keys(stored).filter(Boolean);
  return [];
}

function getUserFcmTokenEntries(user = {}) {
  const stored = user.fcmTokens;
  if (!stored) return [];
  if (Array.isArray(stored)) {
    return stored.filter(Boolean).map(token => ({
      token,
      platform: 'legacy',
      source: 'legacy',
    }));
  }
  if (typeof stored === "object") {
    return Object.entries(stored)
      .filter(([token]) => !!token)
      .map(([token, meta]) => ({
        token,
        platform: meta?.platform || 'unknown',
        source: meta?.source || 'unknown',
      }));
  }
  return [];
}

function invalidFcmTokenCodes(code) {
  return code === "messaging/invalid-registration-token" ||
    code === "messaging/registration-token-not-registered";
}

const DEFAULT_CITY = "sydney";
const CITY_OPTIONS = [
  "sydney",
  "melbourne",
  "canberra",
  "brisbane",
  "adelaide",
  "hobart",
  "perth",
  "rest-of-australia",
];
const VALID_CITIES = new Set(CITY_OPTIONS);

function normalizeCity(value) {
  return VALID_CITIES.has(value) ? value : DEFAULT_CITY;
}

function cityLabel(value) {
  const labels = {
    sydney: "Sydney",
    melbourne: "Melbourne",
    canberra: "Canberra",
    brisbane: "Brisbane",
    adelaide: "Adelaide",
    hobart: "Hobart",
    perth: "Perth",
    "rest-of-australia": "Rest of Australia",
  };
  return labels[normalizeCity(value)] || labels[DEFAULT_CITY];
}

function inPostcodeRanges(postcode, ranges) {
  const value = Number(String(postcode || "").replace(/\D/g, ""));
  if (!Number.isFinite(value)) return false;
  return ranges.some(([from, to]) => value >= from && value <= to);
}

function classifyMetroArea(address = {}) {
  const state = String(address.state || "").trim().toUpperCase();
  const fullAddress = String(address.fullAddress || "").trim().toLowerCase();
  const postcode = address.postcode || String(address.fullAddress || "").match(/\b\d{4}\b/)?.[0] || "";

  if (inPostcodeRanges(postcode, [[2000, 2234], [2555, 2574], [2740, 2786]])) return "sydney";
  if (inPostcodeRanges(postcode, [[3000, 3207], [3335, 3341], [3427, 3430], [3750, 3810], [3910, 3978]])) return "melbourne";
  if (inPostcodeRanges(postcode, [[2600, 2620], [2900, 2920]])) return "canberra";
  if (inPostcodeRanges(postcode, [[4000, 4207], [4300, 4305], [4500, 4520]])) return "brisbane";
  if (inPostcodeRanges(postcode, [[5000, 5199], [5950, 5950]])) return "adelaide";
  if (inPostcodeRanges(postcode, [[7000, 7055]])) return "hobart";
  if (inPostcodeRanges(postcode, [[6000, 6214]])) return "perth";

  if (state === "ACT" || fullAddress.includes(" act ")) return "canberra";
  if (state === "VIC" || fullAddress.includes("vic")) return "melbourne";
  if (state === "QLD" || fullAddress.includes("qld")) return "brisbane";
  if (state === "SA" || fullAddress.includes(" sa ")) return "adelaide";
  if (state === "TAS" || fullAddress.includes("tas")) return "hobart";
  if (state === "WA" || fullAddress.includes(" wa ")) return "perth";
  if (state === "NSW" || fullAddress.includes("nsw")) return "sydney";

  return "rest-of-australia";
}

function getEventMetroArea(event = {}) {
  if (VALID_CITIES.has(event.metroArea)) return event.metroArea;
  const classified = classifyMetroArea(event.address || event);
  if (classified !== "rest-of-australia") return classified;
  return classified;
}

function getUserCity(user = {}) {
  return normalizeCity(user.adminCity || user.defaultCity || DEFAULT_CITY);
}

function normalizeRoleValue(role) {
  return String(role || "").trim().replace(/\s+/g, "").toLowerCase();
}

function isSuperAdminProfile(profile = {}) {
  return normalizeRoleValue(profile.role) === "superadmin";
}

function isAdminProfile(profile = {}) {
  return normalizeRoleValue(profile.role) === "admin";
}

function requestedCityScope(requested, caller = {}) {
  if (caller.role === "superAdmin") {
    return !requested || requested === "all" ? "all" : normalizeCity(requested);
  }
  return getUserCity(caller);
}

function eventInCityScope(event, scopeCity) {
  return scopeCity === "all" || getEventMetroArea(event) === scopeCity;
}

function userInCityScope(user, scopeCity) {
  return scopeCity === "all" || getUserCity(user) === scopeCity;
}

function adminCanAccessEvent(adminUser, event) {
  return adminUser?.role === "superAdmin" || (
    adminUser?.role === "admin" && getEventMetroArea(event) === getUserCity(adminUser)
  );
}

function adminCanAccessUser(adminUser, targetUser) {
  return adminUser?.role === "superAdmin" || (
    adminUser?.role === "admin" && getUserCity(targetUser) === getUserCity(adminUser)
  );
}

// â”€â”€ Secrets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ANTHROPIC_API_KEY     = defineSecret("ANTHROPIC_API_KEY");
const SMTP_HOST             = defineSecret("SMTP_HOST");
const SMTP_PORT             = defineSecret("SMTP_PORT");
const SMTP_USER             = defineSecret("SMTP_USER");
const SMTP_PASS             = defineSecret("SMTP_PASS");
const EMAIL_FROM            = defineSecret("EMAIL_FROM");
const YOUTUBE_CLIENT_ID     = defineSecret("YOUTUBE_CLIENT_ID");
const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const YOUTUBE_RTMP_SECRET   = defineSecret("YOUTUBE_STREAM_KEY");

// â”€â”€â”€ Health check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.helloWorld = onRequest(
  { region: REGION },
  (req, res) => res.send("Community Events backend is running!")
);

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Temporary app store reviewer login. Remove after Google/Apple review is complete.
// Legacy hardcoded tester login intentionally excluded from recovered source.

exports.updateUserContactProfile = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid || request.auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const requesterUid = request.auth.uid;
  const targetUid = String(request.data?.targetUid || requesterUid).trim();
  const fullName = String(request.data?.fullName || '').trim().replace(/\s+/g, ' ');
  const email = String(request.data?.email || '').trim().toLowerCase();
  const hasDefaultCityUpdate = request.data?.defaultCity !== undefined && request.data?.defaultCity !== null;
  const requestedDefaultCity = normalizeCity(String(request.data?.defaultCity || '').trim());

  if (fullName.length < 2 || fullName.length > 100) {
    throw new HttpsError('invalid-argument', 'Enter a valid full name.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }

  let requesterData = null;
  if (targetUid !== requesterUid) {
    const requester = await db.collection('users').doc(requesterUid).get();
    requesterData = requester.data() || {};
    if (!requester.exists || !['admin', 'superAdmin'].includes(requesterData.role)) {
      throw new HttpsError('permission-denied', 'Admin access required.');
    }
  }

  const targetRef = db.collection('users').doc(targetUid);
  const target = await targetRef.get();
  if (!target.exists || !isActiveDeliverableUser(target.data())) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  const targetData = target.data() || {};
  const previousEmail = normaliseEmailAddress(targetData.emailLower || targetData.email);
  const emailChanged = previousEmail && previousEmail !== email;
  if (targetUid !== requesterUid) {
    if (!adminCanAccessUser(requesterData || {}, targetData)) {
      throw new HttpsError('permission-denied', 'You can only update users in your city.');
    }
    if (requesterData.role === 'admin' && (targetData.role || 'user') !== 'user') {
      throw new HttpsError('permission-denied', 'Admins can only edit normal user profiles.');
    }
  }
  if (hasDefaultCityUpdate) {
    const actorData = requesterData || targetData;
    if (actorData.role !== 'superAdmin') {
      throw new HttpsError('permission-denied', 'Only Super Admins can edit user default location.');
    }
  }

  const [lowerMatches, legacyMatches] = await Promise.all([
    db.collection('users').where('emailLower', '==', email).limit(5).get(),
    db.collection('users').where('email', '==', email).limit(5).get(),
  ]);
  const possibleDuplicates = new Map(
    [...lowerMatches.docs, ...legacyMatches.docs].map(doc => [doc.id, doc])
  );
  const duplicate = [...possibleDuplicates.values()].find(doc =>
    doc.id !== targetUid && isActiveDeliverableUser(doc.data())
  );
  if (duplicate) {
    throw new HttpsError('already-exists', 'This email is already used by another account.');
  }

  const authUser = await admin.auth().getUser(targetUid).catch(() => null);
  const rawPhone = String(authUser?.phoneNumber || target.data()?.phone || '').trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  const canonicalPhone = rawPhone.startsWith('+')
    ? rawPhone
    : phoneDigits.startsWith('04')
      ? `+61${phoneDigits.slice(1)}`
      : phoneDigits.startsWith('614')
        ? `+${phoneDigits}`
        : rawPhone;

  if (canonicalPhone) {
    const localPhone = canonicalPhone.startsWith('+614') ? `0${canonicalPhone.slice(3)}` : canonicalPhone;
    const phoneCandidates = [...new Set([canonicalPhone, localPhone, phoneDigits].filter(Boolean))];
    const phoneQueries = await Promise.all(phoneCandidates.map(phone =>
      db.collection('users').where('phone', '==', phone).limit(5).get()
    ));
    const phoneMatches = new Map(phoneQueries.flatMap(result => result.docs).map(doc => [doc.id, doc]));
    const phoneDuplicate = [...phoneMatches.values()].find(doc =>
      doc.id !== targetUid && isActiveDeliverableUser(doc.data())
    );
    if (phoneDuplicate) {
      throw new HttpsError('already-exists', 'This phone number is already attached to another email account.');
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await targetRef.update({
    fullName,
    email,
    emailLower: email,
    ...(hasDefaultCityUpdate ? { defaultCity: requestedDefaultCity } : {}),
    ...(canonicalPhone ? { phone: canonicalPhone, phoneNormalized: canonicalPhone } : {}),
    ...(emailChanged ? {
      emailStatus: 'ok',
      emailNeedsReview: false,
      emailDeliverable: true,
      emailDisabledByBounce: admin.firestore.FieldValue.delete(),
      emailIssueType: admin.firestore.FieldValue.delete(),
      emailIssueReason: admin.firestore.FieldValue.delete(),
      emailLastIssueAt: admin.firestore.FieldValue.delete(),
      emailLastSesMessageId: admin.firestore.FieldValue.delete(),
      emailIssueResolvedAt: now,
      ...(targetData.emailDisabledByBounce ? { reminderEmailEnabled: true } : {}),
    } : {}),
    updatedAt: now,
    profileUpdatedByUid: requesterUid,
  });
  await admin.auth().updateUser(targetUid, { displayName: fullName }).catch(error => {
    console.warn('Could not update Firebase display name:', targetUid, error.message);
  });

  return { profile: {
    id: targetUid,
    fullName,
    email,
    emailLower: email,
    ...(hasDefaultCityUpdate ? { defaultCity: requestedDefaultCity } : {}),
    ...(emailChanged ? {
      emailStatus: 'ok',
      emailNeedsReview: false,
      emailDeliverable: true,
      emailDisabledByBounce: false,
      emailIssueType: '',
      emailIssueReason: '',
    } : {}),
  } };
});

function todaySydney(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}

function buildTransporter(secrets) {
  const host = secrets.SMTP_HOST.value();
  const port = Number(secrets.SMTP_PORT.value() || 587);
  const user = secrets.SMTP_USER.value();
  const pass = secrets.SMTP_PASS.value();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass }
  });
}

const EMAIL_REPLY_TO = 'support@siza.info';
const EMAIL_FROM_ADDRESS = 'support@siza.info';
const EMAIL_FROM_NAME = 'Community Connect | Events';

function emailFrom() {
  // One public sender across reminders, updates and administrator emails.
  // Verify this identity with the configured SMTP provider before deployment.
  // Do not silently substitute a legacy address from SMTP credentials.
  return `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`;
}

function emailEnvelope(secrets, type = 'updates') {
  return {
    from: emailFrom(secrets, type),
    replyTo: EMAIL_REPLY_TO,
  };
}

function normaliseEmailAddress(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isSafeAwsUrl(value = "") {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" &&
      (host === "sns.amazonaws.com" || /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(host));
  } catch {
    return false;
  }
}

function isSafeSnsCertificateUrl(value = "") {
  try {
    const parsed = new URL(value);
    return isSafeAwsUrl(value) &&
      parsed.pathname.startsWith("/SimpleNotificationService-") &&
      parsed.pathname.endsWith(".pem");
  } catch {
    return false;
  }
}

function parseSnsBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : req.rawBody
      ? req.rawBody.toString("utf8")
      : String(req.body || "");
  return JSON.parse(raw || "{}");
}

const snsCertCache = new Map();

function snsStringToSign(message = {}) {
  const addLine = (lines, key) => {
    if (message[key] !== undefined && message[key] !== null && message[key] !== "") {
      lines.push(key, String(message[key]));
    }
  };

  const lines = [];
  if (message.Type === "Notification") {
    ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"].forEach(key => addLine(lines, key));
  } else if (message.Type === "SubscriptionConfirmation" || message.Type === "UnsubscribeConfirmation") {
    ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"].forEach(key => addLine(lines, key));
  }
  return `${lines.join("\n")}\n`;
}

async function getSnsSigningCert(certUrl) {
  if (!isSafeSnsCertificateUrl(certUrl)) {
    throw new Error("Unsafe SNS signing certificate URL");
  }
  const cached = snsCertCache.get(certUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.pem;

  const response = await fetch(certUrl);
  if (!response.ok) {
    throw new Error(`Could not fetch SNS signing certificate: ${response.status}`);
  }
  const pem = await response.text();
  if (!pem.includes("BEGIN CERTIFICATE")) {
    throw new Error("Invalid SNS signing certificate");
  }
  snsCertCache.set(certUrl, {
    pem,
    expiresAt: Date.now() + 6 * 60 * 60 * 1000,
  });
  return pem;
}

function expectedSesSnsTopicArn() {
  try {
    return String(SES_SNS_TOPIC_ARN.value() || process.env.SES_SNS_TOPIC_ARN || process.env.AWS_SES_SNS_TOPIC_ARN || "").trim();
  } catch {
    return String(process.env.SES_SNS_TOPIC_ARN || process.env.AWS_SES_SNS_TOPIC_ARN || "").trim();
  }
}

async function verifySnsSignature(message = {}) {
  const signature = message.Signature;
  const certUrl = message.SigningCertURL;
  const signatureVersion = String(message.SignatureVersion || "1");
  const topicArn = message.TopicArn || "";
  const expectedTopicArn = expectedSesSnsTopicArn();

  if (!expectedTopicArn) {
    throw new Error("SES SNS topic ARN is not configured");
  }
  if (topicArn !== expectedTopicArn) {
    throw new Error("SNS topic ARN does not match expected topic");
  }
  if (!signature || !certUrl || !["1", "2"].includes(signatureVersion)) {
    throw new Error("SNS signature fields missing");
  }

  const pem = await getSnsSigningCert(certUrl);
  const verifier = crypto.createVerify(signatureVersion === "2" ? "sha256WithRSAEncryption" : "sha1WithRSAEncryption");
  verifier.update(snsStringToSign(message), "utf8");
  const ok = verifier.verify(pem, signature, "base64");
  if (!ok) {
    throw new Error("SNS signature verification failed");
  }
}

function sesNotificationRecipients(message = {}) {
  if (message.notificationType === "Bounce") {
    return (message.bounce?.bouncedRecipients || [])
      .map(recipient => ({
        email: normaliseEmailAddress(recipient.emailAddress),
        action: recipient.action || "",
        status: recipient.status || "",
        diagnosticCode: recipient.diagnosticCode || "",
      }))
      .filter(recipient => recipient.email.includes("@"));
  }
  if (message.notificationType === "Complaint") {
    return (message.complaint?.complainedRecipients || [])
      .map(recipient => ({
        email: normaliseEmailAddress(recipient.emailAddress),
        action: "complaint",
        status: message.complaint?.complaintFeedbackType || "",
        diagnosticCode: message.complaint?.arrivalDate || "",
      }))
      .filter(recipient => recipient.email.includes("@"));
  }
  if (message.notificationType === "Delivery") {
    return (message.delivery?.recipients || message.mail?.destination || [])
      .map(email => ({ email: normaliseEmailAddress(email) }))
      .filter(recipient => recipient.email.includes("@"));
  }
  return [];
}

async function findUsersByEmail(email) {
  const emailKey = normaliseEmailAddress(email);
  if (!emailKey) return [];
  const [lowerSnap, legacySnap] = await Promise.all([
    db.collection("users").where("emailLower", "==", emailKey).limit(20).get(),
    db.collection("users").where("email", "==", emailKey).limit(20).get(),
  ]);
  const matches = new Map();
  [...lowerSnap.docs, ...legacySnap.docs].forEach(docSnap => {
    matches.set(docSnap.id, docSnap);
  });
  return [...matches.values()];
}

async function recordSesEmailIssue({ snsMessage = {}, message = {}, recipient = {} }) {
  const notificationType = message.notificationType || "Unknown";
  const email = normaliseEmailAddress(recipient.email);
  if (!email) return { email, matchedUsers: 0, recorded: false };

  const isHardBounce = notificationType === "Bounce" &&
    String(message.bounce?.bounceType || "").toLowerCase() === "permanent";
  const isComplaint = notificationType === "Complaint";
  const needsReview = isHardBounce || isComplaint;
  const status = isComplaint
    ? "complaint"
    : isHardBounce
      ? "bounced"
      : notificationType === "Bounce"
        ? "soft-bounce"
        : "delivered";

  const mail = message.mail || {};
  const issueAt = admin.firestore.FieldValue.serverTimestamp();
  const eventId = crypto
    .createHash("sha256")
    .update(`${snsMessage.MessageId || mail.messageId || Date.now()}|${email}|${notificationType}`)
    .digest("hex");

  await db.collection("emailDeliveryEvents").doc(eventId).set({
    provider: "aws-ses",
    notificationType,
    email,
    status,
    needsReview,
    snsMessageId: snsMessage.MessageId || "",
    sesMessageId: mail.messageId || "",
    source: mail.source || "",
    subject: mail.commonHeaders?.subject || "",
    bounceType: message.bounce?.bounceType || "",
    bounceSubType: message.bounce?.bounceSubType || "",
    complaintFeedbackType: message.complaint?.complaintFeedbackType || "",
    action: recipient.action || "",
    smtpStatus: recipient.status || "",
    diagnosticCode: recipient.diagnosticCode || "",
    topicArn: snsMessage.TopicArn || "",
    eventTimestamp: message.bounce?.timestamp || message.complaint?.timestamp || message.delivery?.timestamp || mail.timestamp || "",
    createdAt: issueAt,
  }, { merge: true });

  const userDocs = await findUsersByEmail(email);
  const batch = db.batch();
  userDocs.forEach(docSnap => {
    const ref = docSnap.ref;
    if (needsReview) {
      const reviewUpdate = {
        emailStatus: status,
        emailNeedsReview: true,
        emailDeliverable: false,
        emailDisabledByBounce: true,
        emailIssueType: status,
        emailIssueReason: recipient.diagnosticCode || message.bounce?.bounceSubType || message.complaint?.complaintFeedbackType || "",
        emailLastIssueAt: issueAt,
        emailLastSesMessageId: mail.messageId || "",
        reminderEmailEnabled: false,
        adminAlertEmailEnabled: false,
        updatedAt: issueAt,
      };
      if (notificationType === "Bounce") {
        reviewUpdate.emailBounceCount = admin.firestore.FieldValue.increment(1);
      }
      if (notificationType === "Complaint") {
        reviewUpdate.emailComplaintCount = admin.firestore.FieldValue.increment(1);
      }
      batch.set(ref, reviewUpdate, { merge: true });
    } else if (notificationType === "Bounce") {
      batch.set(ref, {
        emailStatus: status,
        emailLastSoftBounceAt: issueAt,
        emailSoftBounceCount: admin.firestore.FieldValue.increment(1),
        emailLastSesMessageId: mail.messageId || "",
        updatedAt: issueAt,
      }, { merge: true });
    }
  });
  if (userDocs.length) await batch.commit();

  return { email, matchedUsers: userDocs.length, recorded: true, status, needsReview };
}

exports.sesEmailWebhook = onRequest(
  { region: REGION, timeoutSeconds: 60, secrets: [SES_SNS_TOPIC_ARN] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    let snsMessage;
    try {
      snsMessage = parseSnsBody(req);
    } catch (error) {
      console.warn("SES webhook could not parse SNS body:", error.message);
      res.status(400).send("Invalid SNS body");
      return;
    }

    if (!snsMessage?.Type) {
      res.status(400).send("Missing SNS type");
      return;
    }

    try {
      await verifySnsSignature(snsMessage);
    } catch (error) {
      console.warn("SES webhook SNS signature rejected:", error.message);
      res.status(403).send("Invalid SNS signature");
      return;
    }

    if (snsMessage.Type === "SubscriptionConfirmation") {
      if (!isSafeAwsUrl(snsMessage.SubscribeURL)) {
        res.status(400).send("Unsafe SubscribeURL");
        return;
      }
      try {
        const response = await fetch(snsMessage.SubscribeURL);
        await db.collection("emailWebhookSubscriptions").doc(
          crypto.createHash("sha256").update(snsMessage.TopicArn || snsMessage.MessageId || Date.now().toString()).digest("hex")
        ).set({
          provider: "aws-sns",
          topicArn: snsMessage.TopicArn || "",
          messageId: snsMessage.MessageId || "",
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: response.ok ? "confirmed" : "confirmation-failed",
          httpStatus: response.status,
        }, { merge: true });
        res.status(200).send("Subscription confirmed");
      } catch (error) {
        console.warn("SES webhook subscription confirmation failed:", error.message);
        res.status(500).send("Subscription confirmation failed");
      }
      return;
    }

    if (snsMessage.Type !== "Notification") {
      res.status(200).send("Ignored");
      return;
    }

    let message;
    try {
      message = typeof snsMessage.Message === "string"
        ? JSON.parse(snsMessage.Message)
        : snsMessage.Message || {};
    } catch (error) {
      console.warn("SES webhook could not parse notification message:", error.message);
      res.status(400).send("Invalid SES notification");
      return;
    }

    const recipients = sesNotificationRecipients(message);
    const results = [];
    for (const recipient of recipients) {
      results.push(await recordSesEmailIssue({ snsMessage, message, recipient }));
    }
    console.log(`SES webhook processed ${message.notificationType || "unknown"} for ${results.length} recipient(s).`, results);
    res.status(200).json({ ok: true, notificationType: message.notificationType || "unknown", recipients: results.length });
  }
);

async function sendPrivateStreamLinkToHost({
  secrets,
  uid,
  eventData = {},
  watchUrl,
  sessionRef = null,
  streamVideoRef = null,
  sentFlagField = 'privateLinkEmailSentAt',
}) {
  if (!uid || !watchUrl) return { sent: false, reason: 'missing-user-or-url' };

  const [userSnap, existingSessionSnap, existingVideoSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    sessionRef ? sessionRef.get() : Promise.resolve(null),
    streamVideoRef ? streamVideoRef.get() : Promise.resolve(null),
  ]);

  if (existingSessionSnap?.data()?.[sentFlagField] || existingVideoSnap?.data()?.[sentFlagField]) {
    return { sent: false, reason: 'already-sent' };
  }

  const user = userSnap.exists ? userSnap.data() : {};
  const to = String(user.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, reason: 'missing-email' };
  }

  const transporter = buildTransporter(secrets);
  if (!transporter) throw new Error('Email is not configured. Please set SMTP_HOST, SMTP_USER and SMTP_PASS secrets.');

  const eventTitle = [
    eventData.eventTypeDisplay || eventData.eventType || '',
    eventData.hostName || '',
    eventData.eventSubject || '',
  ].filter(Boolean).join(' - ') || 'Community Event Stream';
  const dateTime = [eventData.eventDate || '', eventData.startTime || ''].filter(Boolean).join(' ');
  const now = admin.firestore.FieldValue.serverTimestamp();

  await sendEventEmail(transporter, {
    ...emailEnvelope(secrets, 'updates'),
    to,
    subject: 'Your private live stream link',
    text: [
      'Your private Community Events live stream is now live.',
      '',
      `Event: ${eventTitle}`,
      dateTime ? `Date/Time: ${dateTime}` : '',
      `Watch link: ${watchUrl}`,
      '',
      'Share this YouTube link only with people you want to view the private stream.',
      '',
      'Community Events Australia',
    ].filter(Boolean).join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
        <p>Your private Community Events live stream is ready.</p>
        <p><strong>Event:</strong> ${escapeHtml(eventTitle)}</p>
        ${dateTime ? `<p><strong>Date/Time:</strong> ${escapeHtml(dateTime)}</p>` : ''}
        <p>
          <a href="${escapeHtml(watchUrl)}" style="display:inline-block;background:#dc2626;color:white;
            text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">
            Open YouTube Stream
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          Share this YouTube link only with people you want to view the private stream.
        </p>
        <p style="color:#6b7280;font-size:13px">Community Events Australia</p>
      </div>
    `,
  });

  const update = {
    [sentFlagField]: now,
    privateLinkEmailRecipient: to,
  };
  await Promise.all([
    sessionRef ? sessionRef.set(update, { merge: true }) : Promise.resolve(),
    streamVideoRef ? streamVideoRef.set(update, { merge: true }) : Promise.resolve(),
  ]);

  return { sent: true, to };
}

const PROGRAMS_UPDATE_IMAGE_URL = "https://communityevents.siza.info/images/programs-update-header.jpg";
const EMAIL_ICON_CALENDAR = String.fromCodePoint(0x1F4C5);
const EMAIL_ICON_MOON = String.fromCodePoint(0x1F319);
const EMAIL_ICON_KEY = String.fromCodePoint(0x1F511);
const EMAIL_ICON_NEW_EVENT = String.fromCodePoint(0x1F4C5);
const EMAIL_ICON_DELETE = String.fromCodePoint(0x1F5D1, 0xFE0F);
const EMAIL_ICON_USER = String.fromCodePoint(0x1F464);
const EMAIL_ICON_LIVE = String.fromCodePoint(0x1F534);
const DEEP_STORIES_INDEX_URL = process.env.DEEP_STORIES_INDEX_URL || "";
const DEEP_STORIES_INDEX_PATH = path.join(__dirname, "assets", "deep-stories-story-index.html");
const DEEP_STORIES_REPORT_URL = "https://communityevents.siza.info/report-ai-content.html";

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sortEventsForUpdate(events) {
  return [...events].sort((a, b) => {
    const timeCompare = String(a.startTime || '').localeCompare(String(b.startTime || ''));
    if (timeCompare !== 0) return timeCompare;
    return String(a.hostName || '').localeCompare(String(b.hostName || ''));
  });
}

function compareEventsByDateTimeData(a = {}, b = {}) {
  const dateCompare = String(a.eventDate || "").localeCompare(String(b.eventDate || ""));
  if (dateCompare) return dateCompare;
  const timeCompare = String(a.startTime || "99:99").localeCompare(String(b.startTime || "99:99"));
  if (timeCompare) return timeCompare;
  return String(a.hostName || "").localeCompare(String(b.hostName || ""));
}

function buildEmailEventRow(e) {
  const reciters = (e.reciters || []).filter(r => r.name)
    .map(r => `${r.type}: ${r.name}`).join(", ");
  return `<div style="margin-top:12px;padding:12px;border:1px solid #d7e4e1;border-radius:8px;background:#f4fbf9">${detailRows([
    ['Time', e.startTime || ''], ['Host', e.hostName || ''], ['Type', e.eventType || ''],
    ['Audience', (e.audienceType === 'Mixed Audience' ? 'Family Event' : e.audienceType) || ''],
    ['Address', e.address?.fullAddress || ''], ['Speaker', e.speakerName || ''], ['Reciters', reciters],
  ])}</div>`;
}

function buildEmailEventTable(title, events) {
  if (!events.length) return "";
  const rows = sortEventsForUpdate(events).map(buildEmailEventRow).join("");
  return `<div style="margin-top:18px">
    <h3 style="margin:0 0 8px;color:#0f766e;font-size:18px">${escapeHtml(title)} (${events.length})</h3>
    ${rows}
  </div>`;
}

function buildGroupedEmailEventTables(events) {
  const centreEvents = events.filter(e => e.organiserType !== "private");
  const privateEvents = events.filter(e => e.organiserType === "private");
  return [
    buildEmailEventTable("Centre Programs", centreEvents),
    privateEvents.length && centreEvents.length
      ? '<div style="height:1px;background:#e5e7eb;margin:22px 0 4px"></div>'
      : '',
    buildEmailEventTable("Private Programs", privateEvents),
  ].filter(Boolean).join("");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function loadDeepStoriesIndexHtml() {
  if (DEEP_STORIES_INDEX_URL) {
    const response = await fetch(DEEP_STORIES_INDEX_URL, {
      headers: { "user-agent": "CommunityEventsAustralia/1.0" },
    });
    if (!response.ok) {
      throw new Error(`Deep Stories index returned HTTP ${response.status}`);
    }
    return response.text();
  }
  return fs.promises.readFile(DEEP_STORIES_INDEX_PATH, "utf8");
}

function parseDeepStoriesIndex(html) {
  const stories = [];
  const storyRegex = /<li\s+class=["']story["'][^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = storyRegex.exec(html || ""))) {
    const block = match[1];
    const titleMatch = block.match(/<a\s+class=["']title["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const summaryMatch = block.match(/<p\s+class=["']brief["'][^>]*>([\s\S]*?)<\/p>/i);
    if (!titleMatch || !summaryMatch) continue;

    const title = stripTags(titleMatch[2]);
    const summary = stripTags(summaryMatch[1]);
    const url = decodeHtmlEntities(titleMatch[1]).trim();
    if (title && summary && /^https?:\/\//i.test(url)) {
      stories.push({ title, summary, url });
    }
  }
  return stories;
}

async function selectDeepStoryForEmail() {
  try {
    const html = await loadDeepStoriesIndexHtml();
    const stories = parseDeepStoriesIndex(html);
    if (!stories.length) return null;

    const ref = db.collection("settings").doc("deepStoriesFeatured");
    const snap = await ref.get().catch(() => null);
    const lastUrl = snap?.exists ? String(snap.data()?.lastUrl || "") : "";
    const pool = stories.length > 1 ? stories.filter(story => story.url !== lastUrl) : stories;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    await ref.set({
      lastUrl: selected.url,
      lastTitle: selected.title,
      selectedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: DEEP_STORIES_INDEX_URL || "bundled-static-index",
    }, { merge: true });

    return selected;
  } catch (err) {
    console.warn("[Deep Stories] Skipping book section:", err.message || err);
    return null;
  }
}

function buildDeepStoryEmailSection(story) {
  if (!story) return "";
  const reportUrl = `${DEEP_STORIES_REPORT_URL}?source=deep-stories-email&title=${encodeURIComponent(story.title)}&url=${encodeURIComponent(story.url)}`;
  return `<div style="margin-top:22px;border-top:1px solid #d1d5db;padding-top:16px">
    <h3 style="margin:0 0 8px;color:#0f766e;font-size:16px;line-height:1.3">Book Read of the Day</h3>
    <div style="border:1px solid #99f6e4;background:#f0fdfa;border-radius:12px;padding:13px 14px">
      <p style="margin:0 0 5px;color:#134e4a;font-size:16px;font-weight:700;line-height:1.35">${escapeHtml(story.title)}</p>
      <p style="margin:0 0 11px;color:#374151;font-size:13px;line-height:1.5">${escapeHtml(story.summary)}</p>
      <p style="margin:0 0 12px">
        <a href="${escapeHtml(story.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;border-radius:8px;padding:9px 14px;font-size:13px">Read this story</a>
      </p>
      <div style="border-top:1px solid #ccfbf1;margin-top:10px;padding-top:9px;color:#6b7280;font-size:11px;line-height:1.45">
        Deep Stories is an AI-assisted under trial stories platform. If you notice incorrect, inappropriate or concerning content,
        <a href="${escapeHtml(reportUrl)}" style="color:#0f766e;font-weight:700">Report a Problem</a>.
      </div>
    </div>
  </div>`;
}

function isISODateString(dateStr) {
  return typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function normalizeICSTime(timeStr, fallback = "00:00") {
  const raw = String(timeStr || fallback).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return fallback;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function toICSDate(dateStr, timeStr = "00:00") {
  // Return local datetime string with TZID; do not convert to UTC.
  // UTC conversion shifts Sydney events by +10/+11 hours causing wrong
  // dates in Apple Calendar and Google Calendar.
  if (!isISODateString(dateStr)) return "";
  const [y, m, d] = dateStr.split("-");
  const [hh, mm] = normalizeICSTime(timeStr).split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function foldICSLine(line = "") {
  const text = String(line);
  const chunks = [];
  for (let i = 0; i < text.length; i += 73) {
    chunks.push((i === 0 ? "" : " ") + text.slice(i, i + 73));
  }
  return chunks.join("\r\n");
}

function pushICS(lines, line) {
  lines.push(foldICSLine(line));
}

// Convert time value to HH:MM string
// Handles: 4-digit integer (1930), Excel decimal fraction (0.8125), string "19:30"
function excelTimeToHHMM(val) {
  if (!val && val !== 0) return "";

  if (typeof val === "string") {
    const clean = val.trim();
    // Already HH:MM
    if (/^\d{1,2}:\d{2}$/.test(clean)) return clean.padStart(5, "0");
    // 4-digit string like "1930"
    const n = parseInt(clean, 10);
    if (!isNaN(n) && clean.length === 4) {
      const h = Math.floor(n / 100), m = n % 100;
      if (h <= 23 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    return "";
  }

  if (typeof val === "number") {
    // 4-digit integer like 1930
    if (val >= 0 && val <= 2359 && Number.isInteger(val)) {
      const h = Math.floor(val / 100), m = val % 100;
      if (h <= 23 && m <= 59) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
    // Excel decimal fraction like 0.8125 = 19:30
    if (val > 0 && val < 1) {
      const totalMins = Math.round(val * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    }
  }
  return "";
}

// Convert Excel date to YYYY-MM-DD â€” handles DD/MM/YYYY, serial numbers, YYYY-MM-DD
function excelDateToYYYYMMDD(val) {
  if (!val && val !== 0) return "";
  // Excel date serial number
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  // DD/MM/YYYY â€” standard Australian format
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

// Compute Hijri date string for a given Gregorian date and adjustment
// â”€â”€ JDN-based Hijri calendar (same algorithm as SIZA Calendar Religiously) â”€â”€
function gregorianToJdn(y,m,d){const a=Math.floor((14-m)/12),yr=y+4800-a,mn=m+12*a-3;return d+Math.floor((153*mn+2)/5)+365*yr+Math.floor(yr/4)-Math.floor(yr/100)+Math.floor(yr/400)-32045;}
function jdnToGregorian(jdn){const a=jdn+32044,b=Math.floor((4*a+3)/146097),c=a-Math.floor((146097*b)/4),d=Math.floor((4*c+3)/1461),e=c-Math.floor((1461*d)/4),m=Math.floor((5*e+2)/153);return{day:e-Math.floor((153*m+2)/5)+1,month:m+3-12*Math.floor(m/10),year:100*b+d-4800+Math.floor(m/10)};}
// Hijri month starts use saved moon-sighting overrides with a 29/30-day fallback.
function islamicToJdnAstro(y,m,d){return d+Math.ceil(29.5*(m-1))+(y-1)*354+Math.floor((3+11*y)/30)+1948439;}
function jdnToIslamicAstro(jdn){const y=Math.floor((30*(jdn-1948439)+10646)/10631),m=Math.min(12,Math.ceil((jdn-29-islamicToJdnAstro(y,1,1))/29.5)+1);return{year:y,month:m,day:jdn-islamicToJdnAstro(y,m,1)+1};}
function monIdx(y,m){return y*12+(m-1);}
function fromMonIdx(idx){return{year:Math.floor(idx/12),month:((idx%12)+12)%12+1};}
function addHijriMonthsServer(y,m,delta){return fromMonIdx(monIdx(y,m)+delta);}
function cmpHijri(a,b){return a.year!==b.year?a.year-b.year:a.month!==b.month?a.month-b.month:(a.day||1)-(b.day||1);}
function sortOv(arr){const sorted=[...(arr||[])].map(o=>({hYear:Number(o?.hYear),hMonth:Number(o?.hMonth),gDate:String(o?.gDate||'')})).filter(o=>o.hYear&&o.hMonth&&o.gDate).sort((a,b)=>cmpHijri({year:a.hYear,month:a.hMonth},{year:b.hYear,month:b.hMonth}));const cleaned=[];for(const o of sorted){const[y,m,d]=o.gDate.split("-").map(Number);if(!y||!m||!d)continue;const j=gregorianToJdn(y,m,d);const p=cleaned[cleaned.length-1];if(p){const[py,pm,pd]=p.gDate.split("-").map(Number);const diff=monIdx(o.hYear,o.hMonth)-monIdx(p.hYear,p.hMonth);const min=Math.max(1,diff)*29;const max=Math.max(1,diff)*30;const dayDiff=j-gregorianToJdn(py,pm,pd);if(diff<=0||dayDiff<min||dayDiff>max)continue;}cleaned.push(o);}return cleaned;}
function deltaForMonthServer(hY,hM,ov){let delta=0;for(const o of sortOv(ov)){const cmp=cmpHijri({year:hY,month:hM},{year:o.hYear,month:o.hMonth});if(cmp>=0){const[y,m,d]=o.gDate.split("-").map(Number);delta=gregorianToJdn(y,m,d)-islamicToJdnAstro(o.hYear,o.hMonth,1);}}return delta;}
function adjustedIslamicToJdnServer(hY,hM,hD,ov){return islamicToJdnAstro(hY,hM,hD)+deltaForMonthServer(hY,hM,ov||[]);}
function monthStartJdnServer(hY,hM,ov){
  return adjustedIslamicToJdnServer(Number(hY),Number(hM),1,ov||[]);
}
function hijriToGreg(hY,hM,hD,ov){return jdnToGregorian(monthStartJdnServer(hY,hM,ov||[])+(hD-1));}
function gregToHijri(gY,gM,gD,ov){
  const so=sortOv(ov);const t=gregorianToJdn(gY,gM,gD);const approx=jdnToIslamicAstro(t);
  for(let i=-14;i<=14;i++){const cand=addHijriMonthsServer(approx.year,approx.month,i);const start=monthStartJdnServer(cand.year,cand.month,so);const next=addHijriMonthsServer(cand.year,cand.month,1);const nextStart=monthStartJdnServer(next.year,next.month,so);if(t>=start&&t<nextStart)return{year:cand.year,month:cand.month,day:t-start+1};}
  return approx;
}
function hijriMonthLengthServer(hY,hM,ov){const next=addHijriMonthsServer(Number(hY),Number(hM),1);return monthStartJdnServer(next.year,next.month,ov||[])-monthStartJdnServer(Number(hY),Number(hM),ov||[]);}

const HIJRI_MONTH_NAMES_SERVER = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Awwal","Jumada al-Thani","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];

function computeHijriDate(gregorianDate, overrides) {
  try {
    const [y,m,d] = gregorianDate.split("-").map(Number);
    const h = gregToHijri(y, m, d, overrides || []);
    return `${h.day} ${HIJRI_MONTH_NAMES_SERVER[h.month-1]} ${h.year} AH`;
  } catch { return ""; }
}

function escICS(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\").replace(/,/g, "\\,")
    .replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// â”€â”€â”€ LIVE CALENDAR FEED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.calendarFeed = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    const uid = req.query.t || req.query.token;  // short: ?t=  legacy: ?token=
    if (!uid) { res.status(400).send("Missing token"); return; }
    try { await admin.auth().getUser(uid); }
    catch { res.status(401).send("Invalid token"); return; }

    const userDoc = await db.collection("users").doc(uid).get();
    const userCity = getUserCity(userDoc.data() || {});

    // Track in calendarSubscriptions collection
    await db.collection("calendarSubscriptions").doc(uid)
      .set({
        uid,
        city: userCity,
        lastPolled: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    // Also update the user's own doc so Admin Dashboard can show sync status
    await db.collection("users").doc(uid).update({
      calendarSynced:     true,
      calendarLastPolled: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {}); // silently ignore if user doc doesn't exist

    const snap = await db.collection("events")
      .where("status", "==", "active")
      .orderBy("eventDate", "asc")
      .get();
    const cityDocs = snap.docs.filter(doc => getEventMetroArea(doc.data()) === userCity);

    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0",
      "PRODID:-//Community Events//EN", "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH", "X-WR-CALNAME:Community Events",
      "X-WR-TIMEZONE:Australia/Sydney",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
      // VTIMEZONE block for Australia/Sydney (AEDT/AEST)
      "BEGIN:VTIMEZONE",
      "TZID:Australia/Sydney",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+1100", "TZOFFSETTO:+1000",
      "TZNAME:AEST",
      "DTSTART:19700405T030000",
      "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:+1000", "TZOFFSETTO:+1100",
      "TZNAME:AEDT",
      "DTSTART:19701004T020000",
      "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=10",
      "END:DAYLIGHT",
      "END:VTIMEZONE"
    ];

    cityDocs
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .forEach(doc => {
      const e    = doc.data();
      if (!isISODateString(e.eventDate)) {
        console.warn("Skipping event with invalid calendar date", { eventId: doc.id, eventDate: e.eventDate });
        return;
      }
      const dtStart = toICSDate(e.eventDate, e.startTime || "00:00");
      const dtEnd   = toICSDate(e.eventDate, e.endTime || e.startTime || "23:59");
      if (!dtStart || !dtEnd) {
        console.warn("Skipping event with invalid calendar time", {
          eventId: doc.id,
          eventDate: e.eventDate,
          startTime: e.startTime,
          endTime: e.endTime,
        });
        return;
      }
      const addr    = e.address?.fullAddress || "";
      lines.push(
        "BEGIN:VEVENT"
      );
      pushICS(lines, `UID:${doc.id}@community-events`);
      pushICS(lines, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`);
      pushICS(lines, `DTSTART;TZID=Australia/Sydney:${dtStart}`);
      pushICS(lines, `DTEND;TZID=Australia/Sydney:${dtEnd}`);
      pushICS(lines, `SUMMARY:${escICS(`${e.eventType || "Event"} - ${e.hostName || "Community Events"}`)}`);
      if (addr) pushICS(lines, `LOCATION:${escICS(addr)}`);
      pushICS(lines, `DESCRIPTION:${escICS(`Audience: ${e.audienceType || "All audiences"}`)}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "no-cache, no-store");
    res.send(lines.join("\r\n"));
  }
);

// â”€â”€â”€ Calendar subscriber count â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getCalendarStats = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Insufficient permissions");
  const snap = await db.collection("calendarSubscriptions").get();
  const activeSince = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const uids = snap.docs
    .filter(d => {
      const lastPolled = d.data()?.lastPolled;
      const millis = typeof lastPolled?.toMillis === "function"
        ? lastPolled.toMillis()
        : lastPolled?.seconds
          ? lastPolled.seconds * 1000
          : 0;
      return millis >= activeSince;
    })
    .map(d => d.id);
  return { count: uids.length, uids, everCount: snap.size };
});

exports.getUserDashboardStats = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== "admin" && role !== "superAdmin") {
    throw new HttpsError("permission-denied", "Admin access required.");
  }

  const snap = await db.collection("users").get();
  const stats = {
    totalProfiles: snap.size,
    activeUsers: 0,
    activeNotMigrated: 0,
    inactiveProfiles: 0,
    migratedProfiles: 0,
    activeSuperAdmins: 0,
    hiddenSuperAdmins: 0,
    activeAdmins: 0,
    activeRegularUsers: 0,
    emailNeedsReview: 0,
    emailBounced: 0,
    emailComplaints: 0,
  };

  const docs = snap.docs.map(docSnap => ({ id: docSnap.id, data: docSnap.data() || {} }));
  const activePhoneEmails = new Set();
  docs.forEach(({ data }) => {
    if (data.isActive === false) return;
    const emailKey = String(data.emailLower || data.email || "").trim().toLowerCase();
    const hasPhone = hasAnyPhoneProfile(data);
    if (emailKey && hasPhone) activePhoneEmails.add(emailKey);
  });

  stats.duplicateEmailProfiles = 0;

  docs.forEach(({ data }) => {
    const hasPhone = hasAnyPhoneProfile(data);
    const isStaleMigratedPhoneProfile = data.isActive !== false && !!data.migratedToUid && hasPhone;
    const isMigrated = !!data.migratedToUid && !isStaleMigratedPhoneProfile;
    const isInactive = data.isActive === false;
    const isHidden = isInactive || isMigrated;
    const userRole = data.role || "user";

    if (isMigrated) stats.migratedProfiles += 1;
    else if (isInactive) stats.inactiveProfiles += 1;

    if (isHidden) {
      if (userRole === "superAdmin") stats.hiddenSuperAdmins += 1;
      return;
    }

    stats.activeUsers += 1;
    const emailKey = String(data.emailLower || data.email || "").trim().toLowerCase();
    if (!hasPhone && emailKey && activePhoneEmails.has(emailKey)) {
      stats.duplicateEmailProfiles += 1;
    } else if (!hasPhone) {
      stats.activeNotMigrated += 1;
    }
    if (data.emailNeedsReview === true) stats.emailNeedsReview += 1;
    if (data.emailStatus === "bounced") stats.emailBounced += 1;
    if (data.emailStatus === "complaint") stats.emailComplaints += 1;
    if (userRole === "superAdmin") stats.activeSuperAdmins += 1;
    else if (userRole === "admin") stats.activeAdmins += 1;
    else stats.activeRegularUsers += 1;
  });

  return stats;
});

exports.cleanupMigratedUserProfiles = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (userDoc.data()?.role !== "superAdmin") {
    throw new HttpsError("permission-denied", "Super Admin access required.");
  }

  const snap = await db.collection("users").where("migratedToUid", ">", "").get();
  let deletedProfiles = 0;
  let skippedProfiles = 0;
  let repairedActiveProfiles = 0;
  let activeEventsTransferred = 0;
  let archivedEventsTransferred = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const oldDoc of snap.docs) {
    const oldData = oldDoc.data() || {};
    if (oldData.isActive !== false && hasAnyPhoneProfile(oldData)) {
      await oldDoc.ref.update({
        migratedToUid: admin.firestore.FieldValue.delete(),
        inactiveReason: admin.firestore.FieldValue.delete(),
        updatedAt: now,
      });
      repairedActiveProfiles++;
      continue;
    }

    const targetUid = String(oldData.migratedToUid || "").trim();
    if (!targetUid || targetUid === oldDoc.id) {
      skippedProfiles++;
      continue;
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    if (!targetSnap.exists) {
      skippedProfiles++;
      continue;
    }

    const targetData = targetSnap.data() || {};
    activeEventsTransferred += await transferUserOwnedDocuments("events", oldDoc.id, targetUid, targetData, now);
    archivedEventsTransferred += await transferUserOwnedDocuments("archivedEvents", oldDoc.id, targetUid, targetData, now);

    const oldCalRef = db.collection("calendarSubscriptions").doc(oldDoc.id);
    const oldCal = await oldCalRef.get();
    if (oldCal.exists) {
      await db.collection("calendarSubscriptions").doc(targetUid).set({
        ...oldCal.data(),
        uid: targetUid,
        migratedFromUid: oldDoc.id,
        updatedAt: now,
      }, { merge: true });
      await oldCalRef.delete().catch(() => {});
    }

    await oldDoc.ref.delete();
    deletedProfiles++;
  }

  return {
    deletedProfiles,
    skippedProfiles,
    repairedActiveProfiles,
    activeEventsTransferred,
    archivedEventsTransferred,
  };
});

function roleRank(role) {
  if (role === "superAdmin") return 3;
  if (role === "admin") return 2;
  return 1;
}

function highestRole(a, b) {
  return roleRank(a) >= roleRank(b) ? (a || "user") : (b || "user");
}

function hasAnyPhoneProfile(data = {}) {
  return !!String(data.phone || data.phoneNumber || data.mobile || data.mobileNumber || "").trim();
}

function isOldMigratedUserProfile(data = {}) {
  return !!data.migratedToUid && !(data.isActive !== false && hasAnyPhoneProfile(data));
}

function isActiveDeliverableUser(data = {}) {
  return data.isActive !== false && !isOldMigratedUserProfile(data);
}

function firstPhoneValue(data = {}) {
  return String(data.phone || data.phoneNumber || data.mobile || data.mobileNumber || "").trim();
}

exports.mergeDuplicateEmailProfiles = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (userDoc.data()?.role !== "superAdmin") {
    throw new HttpsError("permission-denied", "Super Admin access required.");
  }

  const usersSnap = await db.collection("users").get();
  const groups = new Map();
  usersSnap.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (!isActiveDeliverableUser(data)) return;
    const email = String(data.emailLower || data.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push({ id: docSnap.id, ref: docSnap.ref, data });
  });

  let mergedProfiles = 0;
  let skippedGroups = 0;
  let activeEventsTransferred = 0;
  let archivedEventsTransferred = 0;
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const [, group] of groups.entries()) {
    if (group.length < 2) continue;
    const phoneProfiles = group.filter(item => hasAnyPhoneProfile(item.data));
    const emailOnlyProfiles = group.filter(item => !hasAnyPhoneProfile(item.data));

    if (phoneProfiles.length !== 1 || emailOnlyProfiles.length === 0) {
      skippedGroups++;
      continue;
    }

    const target = phoneProfiles[0];
    const targetPhone = firstPhoneValue(target.data);
    const targetPhoneNormalized = normalizeAuPhoneForMigration(targetPhone).canonical ||
      target.data.phoneNormalized || "";

    for (const source of emailOnlyProfiles) {
      const email = String(target.data.emailLower || target.data.email || source.data.email || "").trim().toLowerCase();
      const mergedProfile = {
        ...source.data,
        ...target.data,
        email,
        emailLower: email,
        phone: targetPhone,
        phoneNormalized: targetPhoneNormalized,
        phoneVerified: true,
        fullName: target.data.fullName || source.data.fullName || target.data.displayName || source.data.displayName || target.data.email || source.data.email || "",
        role: highestRole(source.data.role, target.data.role),
        isActive: true,
        migratedToUid: admin.firestore.FieldValue.delete(),
        inactiveReason: admin.firestore.FieldValue.delete(),
        mergedDuplicateUids: admin.firestore.FieldValue.arrayUnion(source.id),
        updatedAt: now,
      };

      await target.ref.set(mergedProfile, { merge: true });
      activeEventsTransferred += await transferUserOwnedDocuments("events", source.id, target.id, mergedProfile, now);
      archivedEventsTransferred += await transferUserOwnedDocuments("archivedEvents", source.id, target.id, mergedProfile, now);

      const oldCalRef = db.collection("calendarSubscriptions").doc(source.id);
      const oldCal = await oldCalRef.get();
      if (oldCal.exists) {
        await db.collection("calendarSubscriptions").doc(target.id).set({
          ...oldCal.data(),
          uid: target.id,
          migratedFromUid: source.id,
          updatedAt: now,
        }, { merge: true });
        await oldCalRef.delete().catch(() => {});
      }

      await source.ref.delete();
      mergedProfiles++;
    }
  }

  return {
    mergedProfiles,
    skippedGroups,
    activeEventsTransferred,
    archivedEventsTransferred,
  };
});

// â”€â”€â”€ AI EVENT SEARCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public event list for guests. Firestore rules cannot mask individual fields,
// so anonymous users receive only this sanitized shape through Cloud Functions.
exports.getPublicEvents = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");

    if (publicEventsCache.expiresAt > Date.now() && publicEventsCache.events.length) {
      return { events: publicEventsCache.events, cached: true };
    }

    const yesterday = todaySydney(-1);
    const [upcomingSnap, liveSnap] = await Promise.all([
      db.collection("events")
        .where("status", "==", "active")
        .where("eventDate", ">=", yesterday)
        .orderBy("eventDate", "asc")
        .limit(150)
        .get(),
      db.collection("events").where("isLive", "==", true).get(),
    ]);

    const docsById = new Map();
    [...upcomingSnap.docs, ...liveSnap.docs].forEach(doc => docsById.set(doc.id, doc));

    const events = [...docsById.values()]
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .map(doc => {
        const e = doc.data();
        if (e.hidden || e.status !== "active") return null;

        const isPrivate = (e.organiserType || "private") === "private";
        const safeAddress = {
          suburb:   e.address?.suburb   || "",
          state:    e.address?.state    || "",
          postcode: e.address?.postcode || "",
        };

        if (!isPrivate) {
          safeAddress.fullAddress = e.address?.fullAddress || "";
          safeAddress.street      = e.address?.street || "";
          safeAddress.latitude    = e.address?.latitude || null;
          safeAddress.longitude   = e.address?.longitude || null;
        }

        return {
          id: doc.id,
          status: e.status || "active",
          hidden: false,
          hostName: e.hostName || "",
          eventDate: e.eventDate || "",
          startTime: e.startTime || "",
          endTime: e.endTime || "",
          hijriDate: e.hijriDate || "",
          hijriDay: e.hijriDay || null,
          hijriMonth: e.hijriMonth || null,
          hijriYear: e.hijriYear || null,
          enteredAsHijri: e.enteredAsHijri === true,
          eventType: e.eventType || "",
          customEventType: e.customEventType || "",
          eventTypeDisplay: e.eventTypeDisplay || e.eventType || "",
          eventSubject: e.eventSubject || "",
          notes: typeof e.notes === "string" ? e.notes.slice(0, 500) : "",
          audienceType: e.audienceType || "",
          organiserType: e.organiserType || "private",
          metroArea: e.metroArea || "",
          isOnBehalfOf: !!e.isOnBehalfOf,
          address: safeAddress,
          speakerName: e.speakerName || "",
          reciters: Array.isArray(e.reciters) ? e.reciters : [],
          isLive: e.isLive === true,
          liveWatchUrl: e.liveWatchUrl || null,
        };
      })
      .filter(Boolean);

    publicEventsCache = { expiresAt: Date.now() + 20 * 1000, events };
    return { events, cached: false };
  }
);

exports.aiEventSearch = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120, enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new Error("Unauthenticated");
    const { query: userQuery, isGuest = false } = request.data;
    if (!userQuery) throw new Error("Missing query");

    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret not configured. Run: firebase functions:secrets:set ANTHROPIC_API_KEY");

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

    const snap = await db.collection("events")
      .where("status", "==", "active")
      .orderBy("eventDate", "asc")
      .get();

    // Limit to 200 most recent upcoming events to keep prompt size manageable
    const todayStr = new Date().toISOString().slice(0, 10);
    const filteredDocs = snap.docs
      .filter(d => (d.data().eventDate || '') >= todayStr)
      .sort((a, b) => compareEventsByDateTimeData(a.data(), b.data()))
      .slice(0, 200);

    const events = filteredDocs.map(d => {
      const e = d.data();
      // For guests: suburb only â€” no full address, no phone
      return {
        id:           d.id,
        eventType:    e.eventType,
        eventTypeDisplay: e.eventTypeDisplay || e.eventType,
        eventSubject: e.eventSubject || "",
        notes: typeof e.notes === "string" ? e.notes.slice(0, 500) : "",
        hostName:     e.hostName,
        eventDate:    e.eventDate,
        startTime:    e.startTime,
        audienceType: e.audienceType,
        organiserType: e.organiserType || "private",
        suburb:       e.address?.suburb   || "",
        state:        e.address?.state    || "",
        postcode:     e.address?.postcode || "",
        // Only include full address and phone for registered users
        fullAddress:  isGuest ? "" : (e.address?.fullAddress || ""),
        hostPhone:    isGuest ? "" : (e.hostPhone || ""),
        speakerName:  e.speakerName || "",
        reciters:     (e.reciters || []).filter(r => r.name)
                        .map(r => `${r.type}: ${r.name}`).join(", ")
      };
    });

    const systemPrompt = `You are an AI event search assistant for Community Events, a Muslim community app in Australia.
You receive the user's query and a JSON array of real events from the database.
Your job:
1. Understand what the user is looking for (event type, date range, suburb, audience type, speaker/reciter names)
2. Return ONLY the matching event IDs
3. Write a friendly 1-2 sentence summary

Date context: today=${today}

Respond ONLY in this exact JSON format, no markdown, no extra text:
{"matchedIds":["id1","id2"],"summary":"Here are the events I found..."}

If nothing matches: {"matchedIds":[],"summary":"I could not find any events matching that. Try different dates or suburbs."}

EVENTS DATABASE:
${JSON.stringify(events)}`;

    let resp;
    try {
      resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5",
        max_tokens: 600,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userQuery }]
      })
    });

    } catch (fetchErr) {
      const { HttpsError } = require("firebase-functions/v2/https");
      throw new HttpsError("internal", `Network error calling Anthropic: ${fetchErr.message}`);
    }
    if (!resp.ok) {
      const errBody = await resp.text();
      let errMsg = `Anthropic API error ${resp.status}`;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed?.error?.message || errMsg;
      } catch {}
      // Use HttpsError so the message reaches the client
      const { HttpsError } = require("firebase-functions/v2/https");
      throw new HttpsError("internal", errMsg);
    }

    const data = await resp.json();
    const raw  = data.content?.[0]?.text || "{}";
    try {
      return JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return { matchedIds: [], summary: "Sorry, I had trouble understanding that. Try rephrasing." };
    }
  }
);

// Daily email reminders - 7 PM Sydney, for tomorrow's events.
exports.dailyEmailReminders = onSchedule(
  { schedule: "0 19 * * *", timeZone: "Australia/Sydney", region: REGION,
    timeoutSeconds: 540,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async () => {
    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) { console.log("SMTP not configured."); return null; }

    // Send reminder for TOMORROW so users can plan ahead
    const date = todaySydney(1);
    const eventsSnapRaw = await db.collection("events")
      .where("status", "==", "active")
      .where("eventDate", "==", date)
      .get();
    // Filter hidden in JS â€” a Firestore "!= true" query drops docs with no
    // `hidden` field at all, which would exclude every legacy/visible event.
    const visibleDocs = eventsSnapRaw.docs.filter(d => d.data().hidden !== true);
    if (visibleDocs.length === 0) return null;
    const eventsByCity = new Map();
    for (const docSnap of visibleDocs) {
      const eventData = docSnap.data();
      const city = getEventMetroArea(eventData);
      if (!eventsByCity.has(city)) eventsByCity.set(city, []);
      eventsByCity.get(city).push(eventData);
    }
    let deepStory = null;
    try {
      deepStory = await selectDeepStoryForEmail();
    } catch (error) {
      console.warn("Deep Stories section skipped:", error.message);
    }
    const htmlByCity = new Map();
    for (const [city, cityEvents] of eventsByCity.entries()) {
      const eventSections = buildGroupedEmailEventTables(cityEvents);
      const deepStorySection = buildDeepStoryEmailSection(deepStory);
      htmlByCity.set(city, `<div>
        ${eventSections}${deepStorySection}
        <p style="color:#6b7280;font-size:12px;padding:16px">
          To opt out: Profile -> Toggle Email Reminder off.
        </p></div>`);
    }

    let sent = 0;
    const allUsers = await db.collection('users').get();

    for (const doc of allUsers.docs) {
      const u = doc.data();
      if (!isActiveDeliverableUser(u)) continue;

      const userCity = getUserCity(u);
      const html = htmlByCity.get(userCity);
      if (!html) continue;

      // Send email if user has email
      if (u.email && u.reminderEmailEnabled !== false) {
        try {
          await sendEventEmail(transporter, {
            ...emailEnvelope({ SMTP_HOST, SMTP_USER, EMAIL_FROM }, 'reminders'),
            to: u.email,
            subject: `${EMAIL_ICON_CALENDAR} Community Events - Tomorrow's Events (${date})`,
            html: html + unsubscribeFooter(doc.id)
          });
          sent++;
          if (sent % 25 === 0) console.log(`Reminder email progress: ${sent} sent for ${date}`);
        } catch(e) { console.warn('Email failed:', u.email, e.message); }
      }
    }
    console.log(`Sent ${sent} reminder emails for tomorrow ${date}`);
    return null;
  }
);

// Daily push reminders - 8 AM Sydney, for same-day events.
exports.dailyPushReminders = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Australia/Sydney", region: REGION },
  async () => {
    const date = todaySydney(0);
    const eventsSnapRaw = await db.collection("events")
      .where("status", "==", "active")
      .where("eventDate", "==", date)
      .get();

    const visibleDocs = eventsSnapRaw.docs
      .filter(d => d.data().hidden !== true)
      .sort((a, b) => String(a.data().startTime || '').localeCompare(String(b.data().startTime || '')));
    if (visibleDocs.length === 0) {
      console.log(`No same-day events for push reminder on ${date}`);
      return null;
    }

    let pushed = 0;
    const allUsers = await db.collection('users').get();

    for (const doc of allUsers.docs) {
      const u = doc.data();
      if (!isActiveDeliverableUser(u)) continue;
      const userCity = getUserCity(u);
      const cityDocs = visibleDocs.filter(eventDoc => getEventMetroArea(eventDoc.data()) === userCity);
      if (cityDocs.length === 0) continue;
      const eventCount = cityDocs.length;
      const firstEvent = cityDocs[0]?.data();
      const tokens = pushNotificationsEnabled(u) ? getUserFcmTokens(u) : [];
      if (tokens.length > 0) {
        const pushMsg = {
          notification: {
            title: `${EMAIL_ICON_MOON} ${eventCount} Community Event${eventCount !== 1 ? 's' : ''} Today`,
            body: firstEvent
              ? `${firstEvent.startTime} - ${firstEvent.hostName} - ${firstEvent.address?.suburb || ''}`
              : `Events today`,
          },
          data: { date, url: APP_DOWNLOAD_URL },
          tokens,
        };
        try {
          const fcmRes = await admin.messaging().sendEachForMulticast(pushMsg);
          pushed += fcmRes.successCount;
          // Remove invalid tokens
          const invalid = [];
          fcmRes.responses.forEach((r, i) => {
            if (!r.success && invalidFcmTokenCodes(r.error?.code)) {
              invalid.push(tokens[i]);
            }
          });
          if (invalid.length > 0) {
            const updates = {};
            invalid.forEach(t => { updates[`fcmTokens.${t}`] = admin.firestore.FieldValue.delete(); });
            await doc.ref.update(updates);
          }
        } catch(e) { console.warn('Push failed for user:', u.email || doc.id, e.message); }
      }
    }
    console.log(`Sent ${pushed} same-day push notifications for ${date}`);
    return null;
  }
);

// â”€â”€â”€ DAILY ARCHIVE â€” 2 AM Sydney â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.dailyEventCleanup = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Australia/Sydney", region: REGION },
  async () => {
    const cutoff = todaySydney(-7);
    const snap = await db.collection("events").where("eventDate", "<", cutoff).get();
    if (snap.empty) return null;

    const eligible = snap.docs.filter(doc => doc.data().isLive !== true);
    const archivedAt = admin.firestore.Timestamp.now();
    let archived = 0;

    // Each event uses two writes (archive + source removal), so stay below the
    // Firestore 500-operation batch limit.
    for (let offset = 0; offset < eligible.length; offset += 240) {
      const batch = db.batch();
      const chunk = eligible.slice(offset, offset + 240);
      for (const eventDoc of chunk) {
        const archiveRef = db.collection("archivedEvents").doc(eventDoc.id);
        batch.set(archiveRef, {
          ...eventDoc.data(),
          status: "inactive",
          archivedAt,
          archivedFromEventId: eventDoc.id,
          archiveReason: "event_date_expired",
        }, { merge: true });
        batch.delete(eventDoc.ref);
      }
      await batch.commit();
      archived += chunk.length;
    }

    console.log(`Archived ${archived} old events; skipped ${snap.size - eligible.length} live events`);
    return null;
  }
);

// â”€â”€â”€ HIJRI MONTH-END REMINDER â€” day before Hijri month end â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.monthlyHijriReminder = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Australia/Sydney", region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async () => {
    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) return null;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const hijriRef = db.collection("settings").doc("hijriCalendar");
    const hijriSnap = await hijriRef.get();
    const hijriSettings = hijriSnap.exists ? hijriSnap.data() : {};
    const overrides = hijriSettings.overrides || [];
    const [ty, tm, td] = today.split("-").map(Number);
    const hijriToday = gregToHijri(ty, tm, td, overrides);
    const monthLength = hijriMonthLengthServer(hijriToday.year, hijriToday.month, overrides);
    if (hijriToday.day !== monthLength - 1) {
      console.log(`Skipping Hijri reminder for ${today}; Hijri day ${hijriToday.day}/${monthLength}`);
      return null;
    }
    const reminderKey = `${hijriToday.year}-${String(hijriToday.month).padStart(2, "0")}`;
    if (hijriSettings.lastMonthEndReminderKey === reminderKey) {
      console.log(`Hijri reminder already sent for ${reminderKey}`);
      return null;
    }
    const nextMonth = addHijriMonthsServer(hijriToday.year, hijriToday.month, 1);
    const snap = await db.collection("users")
      .where("role", "==", "superAdmin")
      .where("isActive", "==", true)
      .get();
    let sent = 0;
    for (const doc of snap.docs) {
      const u = doc.data();
      if (!u.email) continue;
      await sendEventEmail(transporter, {
        ...emailEnvelope({ SMTP_HOST, SMTP_USER, EMAIL_FROM }, 'admin'),
        to: u.email,
        subject: `${EMAIL_ICON_MOON} Community Events - Hijri Month-End Calendar Reminder`,
        html: `<div>
            <p>Hi ${escapeHtml(u.fullName || "Super Admin")},</p>
            <p>This is your reminder to prepare the next <strong>Hijri calendar adjustment</strong> in Community Events.</p>
            <p>Today is <strong>${today}</strong>, calculated as <strong>${hijriToday.day} ${HIJRI_MONTH_NAMES_SERVER[hijriToday.month - 1]} ${hijriToday.year} AH</strong>.</p>
            <p>The current Hijri month is expected to end on day <strong>${monthLength}</strong>. Please confirm the moon sighting and then go to Admin Dashboard - Settings to enter the Gregorian date for <strong>1 ${HIJRI_MONTH_NAMES_SERVER[nextMonth.month - 1]} ${nextMonth.year} AH</strong>.</p>
        </div>`
      });
      sent++;
    }
    await hijriRef.set({ lastMonthEndReminderKey: reminderKey, lastMonthEndReminderSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log(`Sent ${sent} Hijri month-end reminder emails for ${reminderKey}`);
    return null;
  }
);

// â”€â”€â”€ DELETE USER DATA (Callable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.deleteUserData = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Unauthenticated");
  const archiveEventsNow = request.data?.archiveEventsNow === true;
  const userDoc = await db.collection("users").doc(uid).get();
  if (userDoc.exists && userDoc.data().role === "superAdmin") {
    const saSnap = await db.collection("users")
      .where("role", "==", "superAdmin").where("isActive", "==", true).get();
    if (saSnap.size <= 1) throw new Error(
      "You are the only Super Admin. Assign another before deleting your account."
    );
  }
  const eventsSnap = await db.collection("events")
    .where("createdByUserId", "==", uid).get();
  if (eventsSnap.docs.some(eventDoc => eventDoc.data().isLive === true)) {
    throw new HttpsError("failed-precondition", "End your active live stream before deleting your account.");
  }

  const accountDeletedAt = admin.firestore.Timestamp.now();
  let count = 0;
  if (archiveEventsNow) {
    // Preserve the complete event, host and on-behalf-of submission details.
    // Only its lifecycle changes from active to inactive.
    for (let offset = 0; offset < eventsSnap.docs.length; offset += 240) {
      const batch = db.batch();
      const chunk = eventsSnap.docs.slice(offset, offset + 240);
      for (const eventDoc of chunk) {
        batch.set(db.collection("archivedEvents").doc(eventDoc.id), {
          ...eventDoc.data(),
          status: "inactive",
          creatorDeleted: true,
          accountDeletedAt,
          archivedAt: accountDeletedAt,
          archivedFromEventId: eventDoc.id,
          archiveReason: "creator_account_deleted",
        }, { merge: true });
        batch.delete(eventDoc.ref);
      }
      await batch.commit();
      count += chunk.length;
    }
  } else {
    // Keep events visible until the scheduled expiry process archives them.
    for (let offset = 0; offset < eventsSnap.docs.length; offset += 450) {
      const batch = db.batch();
      const chunk = eventsSnap.docs.slice(offset, offset + 450);
      chunk.forEach(eventDoc => batch.update(eventDoc.ref, {
        creatorDeleted: true,
        accountDeletedAt,
      }));
      await batch.commit();
      count += chunk.length;
    }
  }

  const batch = db.batch();
  batch.delete(db.collection("users").doc(uid));
  batch.delete(db.collection("calendarSubscriptions").doc(uid));
  await batch.commit();
  return { archivedNow: archiveEventsNow ? count : 0, keptUntilExpiry: archiveEventsNow ? 0 : count };
});

// Phone-only login migration support.
// Lets a newly verified phone user find and migrate their old Google/Microsoft
// Firestore profile without exposing the users collection to client queries.
async function findUserByEmailForMigration(email, currentUid) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;

  const candidates = [];
  for (const field of ["emailLower", "email"]) {
    const snap = await db.collection("users").where(field, "==", normalized).limit(3).get();
    snap.docs.forEach(doc => candidates.push(doc));
  }

  const seen = new Set();
  for (const docSnap of candidates) {
    if (seen.has(docSnap.id)) continue;
    seen.add(docSnap.id);
    if (docSnap.id === currentUid) continue;
    const data = docSnap.data() || {};
    if (String(data.email || "").trim().toLowerCase() === normalized) {
      return { id: docSnap.id, data };
    }
  }

  const allUsers = await db.collection("users").get();
  for (const docSnap of allUsers.docs) {
    if (docSnap.id === currentUid) continue;
    const data = docSnap.data() || {};
    if (String(data.email || "").trim().toLowerCase() === normalized) {
      return { id: docSnap.id, data };
    }
  }

  return null;
}

function normalizeAuPhoneForMigration(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  let canonical = "";
  if (raw.startsWith("+614") && digits.length === 11) {
    canonical = `+${digits}`;
  } else if (digits.startsWith("614") && digits.length === 11) {
    canonical = `+${digits}`;
  } else if (digits.startsWith("04") && digits.length === 10) {
    canonical = `+61${digits.slice(1)}`;
  }
  const local = canonical ? `0${canonical.slice(3)}` : "";
  return { canonical, local, digits };
}

function profileHasPhone(data, canonicalPhone) {
  if (!canonicalPhone) return false;
  const fields = ["phone", "phoneNormalized", "phoneNumber", "mobile", "mobileNumber"];
  return fields.some(field => normalizeAuPhoneForMigration(data?.[field]).canonical === canonicalPhone);
}

async function findUserByPhoneForMigration(phoneNumber, currentUid) {
  const { canonical, local, digits } = normalizeAuPhoneForMigration(phoneNumber);
  if (!canonical) return null;

  const values = [...new Set([canonical, local, digits].filter(Boolean))];
  const fields = ["phone", "phoneNormalized", "phoneNumber", "mobile", "mobileNumber"];
  const candidates = new Map();

  for (const field of fields) {
    for (const value of values) {
      const snap = await db.collection("users").where(field, "==", value).limit(5).get();
      snap.docs.forEach(docSnap => candidates.set(docSnap.id, docSnap));
    }
  }

  const ordered = [...candidates.values()];
  for (const docSnap of ordered) {
    if (docSnap.id === currentUid) continue;
    const data = docSnap.data() || {};
    if (!isActiveDeliverableUser(data)) continue;
    if (profileHasPhone(data, canonical)) return { id: docSnap.id, data };
  }

  // Older records may have inconsistent phone formatting. The user base is
  // small enough that a final scan is acceptable and avoids locking people out.
  const allUsers = await db.collection("users").get();
  for (const docSnap of allUsers.docs) {
    if (docSnap.id === currentUid || candidates.has(docSnap.id)) continue;
    const data = docSnap.data() || {};
    if (!isActiveDeliverableUser(data)) continue;
    if (profileHasPhone(data, canonical)) return { id: docSnap.id, data };
  }

  return null;
}

async function transferUserOwnedDocuments(collectionName, oldUid, phoneUid, migratedProfile, now) {
  const snap = await db.collection(collectionName).where("createdByUserId", "==", oldUid).get();
  let batch = db.batch();
  let count = 0;
  for (const ownedDoc of snap.docs) {
    batch.update(ownedDoc.ref, {
      createdByUserId: phoneUid,
      createdByUserEmail: migratedProfile.email || "",
      createdByName: migratedProfile.fullName || migratedProfile.email || "",
      migratedFromUid: oldUid,
      updatedAt: now,
    });
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 450 !== 0) await batch.commit();
  return count;
}

async function migrateExistingProfileToPhoneUid(match, phoneUid, phoneNumber, emailFallback = "") {
  const oldUid = match.id;
  const oldData = match.data || {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const email = String(oldData.email || emailFallback || "").trim().toLowerCase();
  const migratedProfile = {
    ...oldData,
    email,
    emailLower: email,
    phone: phoneNumber || oldData.phone || "",
    phoneNormalized: normalizeAuPhoneForMigration(phoneNumber || oldData.phone).canonical || oldData.phoneNormalized || "",
    phoneVerified: true,
    migratedFromUid: oldUid,
    migratedAt: now,
    isActive: true,
    migratedToUid: admin.firestore.FieldValue.delete(),
    inactiveReason: admin.firestore.FieldValue.delete(),
    updatedAt: now,
  };

  const phoneRef = db.collection("users").doc(phoneUid);
  const oldRef = db.collection("users").doc(oldUid);
  await phoneRef.set(migratedProfile, { merge: true });
  const activeEventsTransferred = await transferUserOwnedDocuments("events", oldUid, phoneUid, migratedProfile, now);
  const archivedEventsTransferred = await transferUserOwnedDocuments("archivedEvents", oldUid, phoneUid, migratedProfile, now);

  const oldCalRef = db.collection("calendarSubscriptions").doc(oldUid);
  const oldCal = await oldCalRef.get();
  if (oldCal.exists) {
    await db.collection("calendarSubscriptions").doc(phoneUid).set({
      ...oldCal.data(),
      uid: phoneUid,
      migratedFromUid: oldUid,
      updatedAt: now,
    }, { merge: true });
    await oldCalRef.delete().catch(error => {
      console.warn(`Could not delete old calendar subscription ${oldUid}`, error);
    });
  }

  await oldRef.delete().catch(error => {
    console.warn(`Could not delete migrated profile ${oldUid}`, error);
  });

  return {
    migrated: true,
    fromUid: oldUid,
    toUid: phoneUid,
    eventsTransferred: activeEventsTransferred + archivedEventsTransferred,
    activeEventsTransferred,
    archivedEventsTransferred,
    profile: {
      fullName: migratedProfile.fullName || "",
      email: migratedProfile.email || "",
      role: migratedProfile.role || "user",
      phone: migratedProfile.phone || "",
      isActive: true,
    },
  };
}

exports.lookupPhoneAccountByEmail = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const match = await findUserByEmailForMigration(request.data?.email, request.auth.uid);
  if (!match) return { found: false };

  const data = match.data;
  return {
    found: true,
    profile: {
      id: match.id,
      fullName: data.fullName || data.displayName || "",
      email: data.email || "",
    },
  };
});

exports.migratePhoneAccountByPhone = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const phoneUid = request.auth.uid;
  const phoneNumber = request.auth.token.phone_number || "";
  const currentSnap = await db.collection("users").doc(phoneUid).get();
  const currentData = currentSnap.exists ? currentSnap.data() || {} : {};
  const match = await findUserByPhoneForMigration(phoneNumber, phoneUid) ||
    await findUserByEmailForMigration(currentData.email || currentData.emailLower, phoneUid);
  if (!match) return { migrated: false };

  return migrateExistingProfileToPhoneUid(match, phoneUid, phoneNumber);
});

exports.migratePhoneAccountByEmail = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const phoneUid = request.auth.uid;
  const phoneNumber = request.auth.token.phone_number || "";
  const match = await findUserByEmailForMigration(request.data?.email, phoneUid);
  if (!match) throw new HttpsError("not-found", "No existing account found for this email.");

  return migrateExistingProfileToPhoneUid(match, phoneUid, phoneNumber, request.data?.email);
});

// â”€â”€â”€ BULK IMPORT EVENTS (Callable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.bulkImportEvents = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error("Unauthenticated");
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  const callerData = userDoc.data() || {};
  const role = callerData.role;
  if (role !== "admin" && role !== "superAdmin") throw new Error("Admins only");

  const { events: rawEvents } = request.data;
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) throw new Error("No events provided");

  // Fetch Hijri adjustment setting
  const hijriSnap  = await db.collection("settings").doc("hijriCalendar").get();
  const hijriAdj   = hijriSnap.exists ? (hijriSnap.data().adjustmentDays || 0) : 0; // legacy
  const hijriOverrides = hijriSnap.exists ? (hijriSnap.data().overrides || []) : [];

  const VALID_TYPES    = ["Majlis", "Milad", "Prayers", "Dua", "Prayers & Amal", "Birthday", "Informal get together", "Custom"];
  const VALID_AUDIENCE = ["Gents only", "Ladies only", "Kids only", "Family Event", "Mixed Audience"];
  const VALID_RECITERS = ["Soz", "Salam", "Manqebat", "Noha", "Marsiya", "Hadees-e-Kisa", "Reciter", "Peshkhani", "Other"];
  const VALID_ORGANISER_TYPES = ["private", "centre", "org"];
  const VALID_STATES = ["NSW", "VIC", "ACT", "QLD", "SA", "TAS", "WA", "NT"];
  const REQUIRED = ["hostName", "startTime", "eventType", "audienceType", "street", "suburb", "state", "postcode"];
  const clean = value => String(value ?? "").trim();
  const toBool = value => ["true", "yes", "y", "1"].includes(clean(value).toLowerCase());
  const isValidDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
  const isValidTime = value => /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) <= 23 && Number(value.slice(3, 5)) <= 59;

  const prepared = [];
  const errors = [];

  for (let i = 0; i < rawEvents.length; i++) {
    const row = rawEvents[i]; const rowErrors = [];
    const rowNumber = i + 3;

    const eventDate = excelDateToYYYYMMDD(row.eventDate);
    const startTime = excelTimeToHHMM(row.startTime);
    const endTime   = excelTimeToHHMM(row.endTime);
    const enteredAsHijri = toBool(row.enteredAsHijri);

    REQUIRED.forEach(f => {
      const val = f === "startTime" ? startTime : row[f];
      if (!val?.toString().trim()) rowErrors.push(`${f} is required`);
    });

    if (!enteredAsHijri && !eventDate) rowErrors.push("eventDate is required unless enteredAsHijri is TRUE");
    if (eventDate && !isValidDate(eventDate)) rowErrors.push("eventDate must be a real date in YYYY-MM-DD format");
    if (startTime && !isValidTime(startTime)) rowErrors.push("startTime must be HH:MM in 24-hour time");
    if (endTime && !isValidTime(endTime)) rowErrors.push("endTime must be HH:MM in 24-hour time");

    const eventType = clean(row.eventType);
    const customEventType = clean(row.customEventType);
    if (eventType && !VALID_TYPES.includes(eventType)) rowErrors.push(`eventType must be one of: ${VALID_TYPES.join(", ")}`);
    if (eventType === "Custom" && !customEventType) rowErrors.push("customEventType is required when eventType is Custom");

    let audienceType = clean(row.audienceType);
    if (audienceType === "Mixed Audience") audienceType = "Family Event";
    if (audienceType && !VALID_AUDIENCE.includes(audienceType)) rowErrors.push(`audienceType must be one of: ${VALID_AUDIENCE.join(", ")}`);

    const state = clean(row.state).toUpperCase();
    const postcode = clean(row.postcode);
    if (state && !VALID_STATES.includes(state)) rowErrors.push(`state must be one of: ${VALID_STATES.join(", ")}`);
    if (postcode && !/^\d{4}$/.test(postcode)) rowErrors.push("postcode must be 4 digits");

    let organiserType = clean(row.organiserType || "private").toLowerCase();
    if (organiserType === "organisation") organiserType = "org";
    if (!VALID_ORGANISER_TYPES.includes(organiserType)) rowErrors.push("organiserType must be Private, Centre, or Org");

    const reciters = [];
    for (let r = 1; r <= 3; r++) {
      const rType = row[`reciter${r}Type`]?.toString().trim();
      const rName = row[`reciter${r}Name`]?.toString().trim();
      if (rName && !rType) rowErrors.push(`reciter${r}Type is required when reciter${r}Name is filled`);
      if (rType && !rName) rowErrors.push(`reciter${r}Name is required when reciter${r}Type is filled`);
      if (rType && !VALID_RECITERS.includes(rType)) rowErrors.push(`reciter${r}Type must be one of: ${VALID_RECITERS.join(", ")}`);
      if (rName && rType) reciters.push({ type: rType, name: rName });
    }

    let resolvedDate = eventDate;
    let hijriDay = null;
    let hijriMonth = null;
    let hijriYear = null;
    if (enteredAsHijri) {
      hijriDay = Number(row.hijriDay);
      hijriMonth = Number(row.hijriMonth);
      hijriYear = Number(row.hijriYear);
      if (!Number.isInteger(hijriDay) || hijriDay < 1 || hijriDay > 30) rowErrors.push("hijriDay must be 1 to 30");
      if (!Number.isInteger(hijriMonth) || hijriMonth < 1 || hijriMonth > 12) rowErrors.push("hijriMonth must be 1 to 12");
      if (!Number.isInteger(hijriYear) || hijriYear < 1400 || hijriYear > 1600) rowErrors.push("hijriYear must be between 1400 and 1600");
      if (rowErrors.length === 0) {
        const converted = hijriToGregorianServer(hijriDay, hijriMonth, hijriYear, hijriOverrides);
        if (converted) resolvedDate = converted;
        else rowErrors.push(`Cannot convert Hijri ${row.hijriDay}/${row.hijriMonth}/${row.hijriYear}`);
      }
    }
    if (!resolvedDate || !isValidDate(resolvedDate)) rowErrors.push("resolved event date is invalid");

    const street = clean(row.street);
    const suburb = clean(row.suburb);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const fullAddress = clean(row.fullAddress) || `${street}, ${suburb} ${state} ${postcode}, Australia`;
    const addressData = {
      street, suburb, state, postcode,
      fullAddress,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null
    };
    const metroArea = classifyMetroArea(addressData);
    if (role !== "superAdmin" && metroArea !== getUserCity(callerData)) {
      rowErrors.push(`This event is in ${cityLabel(metroArea)}. Admin imports are limited to ${cityLabel(getUserCity(callerData))}.`);
    }

    if (rowErrors.length > 0) { errors.push({ row: rowNumber, errors: rowErrors }); continue; }

    const isReligious = ["Majlis", "Milad", "Prayers", "Dua", "Prayers & Amal", "Custom"].includes(eventType);
    const hijriDate = computeHijriDate(resolvedDate, hijriOverrides);
    const organisationType = organiserType === "private" ? "private" : organiserType;

    prepared.push({
      hostName: clean(row.hostName),
      hostPhone: clean(row.hostPhone),
      eventDate: resolvedDate,
      enteredAsHijri,
      hijriDay,
      hijriMonth,
      hijriYear,
      eventType,
      customEventType,
      eventSubject: clean(row.eventSubject),
      eventTypeDisplay: eventType === "Custom" && customEventType ? customEventType : eventType,
      audienceType,
      isOnBehalfOf: true,   // Excel imports always on behalf of
      organiserType,
      organisationType,
      organisationSlug: clean(row.organisationSlug),
      hostContactOptional: clean(row.hostContact),
      address: addressData,
      metroArea,
      speakerName: isReligious ? clean(row.speakerName) : "",
      reciters:    isReligious ? reciters : [],
      notes: clean(row.notes),
      status: "active",
      createdByUserId:    request.auth.uid,
      createdByUserEmail: userDoc.data()?.email || "",
      submittedByName:    userDoc.data()?.fullName || "",
      submittedByRole:    role,
      hijriDate,   // display string e.g. "10 Muharram 1448 AH"
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  if (errors.length > 0) {
    return {
      created: 0,
      errors,
      message: `No events imported. Fix ${errors.length} row(s) and upload again.`
    };
  }

  let batch = db.batch();
  let createdCount = 0;
  for (const event of prepared) {
    batch.set(db.collection("events").doc(), event);
    createdCount++;
    if (createdCount % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();

  return {
    created: createdCount,
    errors: [],
    message: `Successfully imported ${createdCount} event(s).`
  };
});

async function runManualReminderEmailSend({ payload = {}, callerData = {}, cityScope }) {
  const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM });
  if (!transporter) {
    throw new Error("Email is not configured. Please set SMTP_HOST, SMTP_USER and SMTP_PASS secrets.");
  }

  const {
    mode,
    date,
    from,
    to,
    month,
    customMode = false,
    customMessage = '',
    customTemplate = ''
  } = payload || {};
  const safeCityScope = cityScope || requestedCityScope(payload.city, callerData);
  const todaySyd = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

  let eventsQuery = db.collection("events").where("status", "==", "active");
  let label = "";

  if (mode === "range" && from && to) {
    eventsQuery = eventsQuery.where("eventDate", ">=", from).where("eventDate", "<=", to);
    label = `${from} to ${to}`;
  } else if (mode === "month" && month) {
    const [y, m] = month.split("-");
    const firstDay = `${y}-${m}-01`;
    const lastDay  = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);
    eventsQuery = eventsQuery.where("eventDate", ">=", firstDay).where("eventDate", "<=", lastDay);
    label = month;
  } else {
    const targetDate = date || todaySyd;
    eventsQuery = eventsQuery.where("eventDate", "==", targetDate);
    label = targetDate;
  }

  const eventsSnapRaw = customMode
    ? { empty: true, docs: [], size: 0 }
    : await eventsQuery.get();
  const scopedEventDocs = customMode
    ? []
    : eventsSnapRaw.docs.filter(docSnap => {
        const eventData = docSnap.data();
        return eventData.hidden !== true && eventInCityScope(eventData, safeCityScope);
      });
  const eventsSnap = customMode
    ? eventsSnapRaw
    : { empty: scopedEventDocs.length === 0, docs: scopedEventDocs, size: scopedEventDocs.length };

  if (eventsSnap.empty && !customMode) {
    return { sent: 0, failed: 0, events: 0, message: `No events found for ${label}. No emails sent.` };
  }

  const sentBy = callerData.fullName || callerData.email || "Admin";
  const scopeLabel = safeCityScope === "all" ? "all cities" : cityLabel(safeCityScope);
  let deepStorySection = "";
  if (!customMode) {
    const deepStory = await selectDeepStoryForEmail();
    deepStorySection = buildDeepStoryEmailSection(deepStory);
  }

  const buildManualReminderHtml = (eventDocs, targetScopeLabel) => {
    const eventSections = buildGroupedEmailEventTables(eventDocs.map(d => d.data()));
    return `<div>
    <p style="margin:0 0 12px">Events for ${escapeHtml(label)} - ${escapeHtml(targetScopeLabel)}</p>
    ${eventSections}${deepStorySection}
    <p style="color:#6b7280;font-size:12px;padding:16px">
      This reminder was manually sent by ${escapeHtml(sentBy)}.<br>
      To opt out of reminders: Profile -> Toggle Email Reminder off.
    </p></div>`;
  };

  const htmlByRecipientCity = new Map();
  let singleCityHtml = "";
  if (!customMode && safeCityScope === "all") {
    for (const eventDoc of eventsSnap.docs) {
      const eventCity = getEventMetroArea(eventDoc.data());
      if (!htmlByRecipientCity.has(eventCity)) htmlByRecipientCity.set(eventCity, []);
      htmlByRecipientCity.get(eventCity).push(eventDoc);
    }
    for (const [eventCity, docs] of htmlByRecipientCity.entries()) {
      htmlByRecipientCity.set(eventCity, buildManualReminderHtml(docs, cityLabel(eventCity)));
    }
  } else if (!customMode) {
    singleCityHtml = buildManualReminderHtml(eventsSnap.docs, scopeLabel);
  }

  // Read all users so legacy profiles without reminderEmailEnabled are still treated as enabled.
  const usersSnap = await db.collection("users").get();

  let sent = 0;
  const errors = [];
  for (const doc of usersSnap.docs) {
    const u = doc.data();
    if (!isActiveDeliverableUser(u)) continue;
    if (u.reminderEmailEnabled === false) continue;
    let recipientHtml = singleCityHtml;
    if (customMode) {
      if (!userInCityScope(u, safeCityScope)) continue;
    } else if (safeCityScope === "all") {
      recipientHtml = htmlByRecipientCity.get(getUserCity(u));
      if (!recipientHtml) continue;
    } else if (!userInCityScope(u, safeCityScope)) {
      continue;
    }
    if (!u.email) continue;
    try {
      await sendEventEmail(transporter, {
        ...emailEnvelope(
          { SMTP_HOST, SMTP_USER, EMAIL_FROM },
          customMode ? 'updates' : 'reminders'
        ),
        to: u.email,
        subject: customMode
          ? (customTemplate === 'storeAnnouncement'
              ? 'Community Events Australia is now on Google Play, the App Store and Microsoft Store'
              : 'Important Update from Community Events')
          : `${EMAIL_ICON_CALENDAR} Community Events - Events for ${label}`,
        html: customMode && customTemplate === 'storeAnnouncement'
          ? buildStoreAnnouncementEmail() + unsubscribeFooter(doc.id)
          : customMode
          ? `<div>
              <p style="white-space:pre-wrap;margin:0">${escapeHtml(customMessage)}</p>
              ${unsubscribeFooter(doc.id)}
            </div>`
          : recipientHtml + unsubscribeFooter(doc.id)
      });
      sent++;
      if (sent % 25 === 0) {
        console.log(`Manual reminder progress: ${sent} sent for ${label} (${scopeLabel})`);
      }
    } catch (e) {
      console.error('[Manual Email] SMTP send failed:', u.email, e.message);
      errors.push({ email: u.email, error: e.message });
    }
  }

  return {
    sent,
    failed: errors.length,
    events: eventsSnap.size,
    errors: errors.slice(0, 25),
    message: customMode
      ? `Sent to ${sent} user(s) in ${scopeLabel}${errors.length ? ` - ${errors.length} failed` : ''}.`
      : `Sent to ${sent} user(s) in ${scopeLabel} - ${eventsSnap.size} event(s) included${errors.length ? ` - ${errors.length} failed` : ''}.`
  };
}

// Manual reminder sends are queued so the admin button does not time out on mobile.
exports.sendRemindersNow = onCall(
  { region: REGION, timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerData = userDoc.data() || {};
    const role = callerData.role;
    if (role !== "admin" && role !== "superAdmin") {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const payload = request.data || {};
    const cityScope = requestedCityScope(payload.city, callerData);
    const jobRef = await db.collection("reminderEmailJobs").add({
      payload,
      cityScope,
      requestedBy: request.auth.uid,
      requestedByEmail: callerData.email || "",
      requestedByName: callerData.fullName || "",
      requestedByRole: role,
      requestedByCity: getUserCity(callerData),
      status: "queued",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      queued: true,
      jobId: jobRef.id,
      sent: 0,
      message: "Reminder email queued. It will send in the background now."
    };
  }
);

exports.onReminderEmailJobCreated = onDocumentCreated(
  {
    document: "reminderEmailJobs/{jobId}",
    region: REGION,
    timeoutSeconds: 540,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM]
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const jobRef = snap.ref;
    const job = snap.data() || {};
    if (job.status !== "queued") return null;

    await jobRef.set({
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    try {
      const result = await runManualReminderEmailSend({
        payload: job.payload || {},
        cityScope: job.cityScope,
        callerData: {
          role: job.requestedByRole || "admin",
          email: job.requestedByEmail || "",
          fullName: job.requestedByName || "",
          adminCity: job.requestedByCity || DEFAULT_CITY,
          defaultCity: job.requestedByCity || DEFAULT_CITY
        }
      });
      await jobRef.set({
        ...result,
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`Reminder email job ${event.params.jobId} completed: ${result.sent} sent, ${result.failed} failed.`);
      return null;
    } catch (error) {
      console.error(`Reminder email job ${event.params.jobId} failed:`, error);
      await jobRef.set({
        status: "failed",
        error: error.message || String(error),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return null;
    }
  }
);

// â”€â”€â”€ RECALCULATE HIJRI EVENTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called from Admin Dashboard when Hijri adjustment is saved.
// Updates eventDate (Gregorian) for all events entered as Hijri dates.
exports.recalculateHijriEvents = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== "superAdmin") throw new HttpsError("permission-denied", "Super Admin access required.");

    const adjustmentDays = Number(request.data?.adjustmentDays ?? 0);

    // Always read overrides directly from Firestore â€” most up to date
    const settingsSnap = await db.collection("settings").doc("hijriCalendar").get();
    const newOverrides = settingsSnap.exists ? (settingsSnap.data().overrides || []) : [];
    console.log(`recalculate: using ${newOverrides.length} overrides from Firestore`);

    // Fetch ALL events regardless of status
    const allSnap = await db.collection("events").get();

    console.log(`recalculate: processing ${allSnap.size} total events with ${newOverrides.length} overrides`);

    if (allSnap.empty) return { updated: 0 };

    let batch        = db.batch();
    let countHijri   = 0;  // Hijri-entered: eventDate + hijriDate updated
    let countGreg    = 0;  // Gregorian-entered: hijriDate tag only updated

    for (const doc of allSnap.docs) {
      const e = doc.data();
      const { hijriDay, hijriMonth, hijriYear, eventDate, enteredAsHijri } = e;
      const isHijriEntered = enteredAsHijri === true && !!(hijriDay && hijriMonth && hijriYear);

      if (isHijriEntered) {
        // â”€â”€ Hijri-entered event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Recompute Gregorian eventDate from stored Hijri components
        const newGreg = hijriToGregorianServer(hijriDay, hijriMonth, hijriYear, newOverrides || []);
        if (!newGreg) continue;

        // Build the visible Hijri label from the recalculated Gregorian date
        // and the current overrides, so the UI reflects the same adjustment.
        const hijriDate = computeHijriDate(newGreg, newOverrides || []);

        batch.update(doc.ref, {
          eventDate: newGreg,
          hijriDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        countHijri++;

      } else if (eventDate) {
        // â”€â”€ Gregorian-entered event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // eventDate is fixed â€” only update the hijriDate display tag
        const newHijriDate = computeHijriDate(eventDate, newOverrides || []);
        if (!newHijriDate) continue;

        batch.update(doc.ref, {
          hijriDate: newHijriDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        countGreg++;
      }

      if ((countHijri + countGreg) % 450 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    await batch.commit();
    console.log(`Recalculated: ${countHijri} Hijri-entered (date+tag), ${countGreg} Gregorian-entered (tag only), overrides=${newOverrides.length}`);
    return {
      updated:       countHijri + countGreg,
      hijriEvents:   countHijri,
      gregEvents:    countGreg,
      overridesUsed: newOverrides.length,
      totalEvents:   allSnap.size
    };
  }
);

// Server-side Hijri â†’ Gregorian conversion
function hijriToGregorianServer(hDay, hMonth, hYear, overrides) {
  // Uses JDN algorithm â€” same as SIZA Calendar Religiously
  try {
    const g = hijriToGreg(hYear, hMonth, hDay, overrides || []);
    return `${g.year}-${String(g.month).padStart(2,"0")}-${String(g.day).padStart(2,"0")}`;
  } catch { return null; }
}

// â”€â”€â”€ ADMIN DELETE USER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Allows Super Admins to delete another user's account and all their data.
// Different from deleteUserData (which is self-deletion) â€” this is admin-initiated.
exports.adminDeleteUser = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");

    if (!request.auth) throw new HttpsError("unauthenticated", "You must be logged in.");

    // Super Admins can manage all accessible users; city Admins can only manage normal users in their city.
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerData = callerDoc.data() || {};
    const callerRole = callerData.role || "user";
    if (!["admin", "superAdmin"].includes(callerRole)) {
      throw new HttpsError("permission-denied", "Admin access required to delete users.");
    }

    const { targetUid, ban = false } = request.data;
    if (!targetUid) throw new HttpsError("invalid-argument", "Missing targetUid.");
    if (targetUid === request.auth.uid) {
      throw new HttpsError("invalid-argument", "You cannot delete your own account this way. Use Profile â†’ Delete Account instead.");
    }

    // Safety check â€” cannot delete the last super admin
    const targetDoc = await db.collection("users").doc(targetUid).get();
    if (!targetDoc.exists) {
      throw new HttpsError("not-found", "User not found in database.");
    }
    const targetData = targetDoc.data() || {};
    const targetRole = targetData.role || "user";
    if (!adminCanAccessUser(callerData, targetData)) {
      throw new HttpsError("permission-denied", "You can only manage users in your city.");
    }
    if (callerRole === "admin" && targetRole !== "user") {
      throw new HttpsError("permission-denied", "Admins can only delete or ban normal users.");
    }
    if (targetRole === "superAdmin") {
      const saSnap = await db.collection("users")
        .where("role", "==", "superAdmin")
        .where("isActive", "==", true)
        .get();
      if (saSnap.size <= 1) {
        throw new HttpsError("failed-precondition", "Cannot delete the only Super Admin. Assign another Super Admin first.");
      }
    }

    // Delete all events by this user
    const eventsSnap = await db.collection("events")
      .where("createdByUserId", "==", targetUid).get();
    let batch = db.batch(); let count = 0;
    for (const doc of eventsSnap.docs) {
      batch.delete(doc.ref); count++;
      if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
    }

    // Delete user profile and calendar subscription
    batch.delete(db.collection("users").doc(targetUid));
    batch.delete(db.collection("calendarSubscriptions").doc(targetUid));

    // If banned â€” store full profile in bannedUsers so unban can restore it
    if (ban && targetData.email) {
      batch.set(db.collection("bannedUsers").doc(targetData.email.toLowerCase().replace(/\./g,'_')), {
        email:     targetData.email.toLowerCase(),
        bannedAt:  admin.firestore.FieldValue.serverTimestamp(),
        bannedBy:  request.auth.uid,
        reason:    "Admin deletion with ban",
        fullName:  targetData.fullName || "",
        uid:       targetUid,
        role:      targetData.role    || "user",   // preserve original role
        phone:     targetData.phone   || "",
        phoneVerified: targetData.phoneVerified || false,
      });
    }

    await batch.commit();

    // Delete the Firebase Auth account
    try {
      await admin.auth().deleteUser(targetUid);
    } catch (e) {
      console.warn("Could not delete auth account:", e.message);
    }

    console.log(`Admin ${request.auth.uid} deleted user ${targetUid}, events: ${count}, banned: ${ban}`);
    return { deleted: true, eventsRemoved: count, banned: ban };
  }
);

// â”€â”€â”€ TRANSFER EVENT OWNERSHIP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.transferEventOwnership = onCall({ region: REGION }, async (request) => {
  const { HttpsError } = require("firebase-functions/v2/https");
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  const callerDoc = await db.collection("users").doc(request.auth.uid).get();
  const callerData = callerDoc.data() || {};
  const role = callerData.role || "user";
  if (!["admin","superAdmin"].includes(role))
    throw new HttpsError("permission-denied", "Admin access required.");
  const { fromUid, toUid, eventIds } = request.data;
  if (!toUid) throw new HttpsError("invalid-argument", "toUid required.");
  const toDoc = await db.collection("users").doc(toUid).get();
  if (!toDoc.exists) throw new HttpsError("not-found", "Target user not found.");
  const toData = toDoc.data();
  if (!adminCanAccessUser(callerData, toData || {})) {
    throw new HttpsError("permission-denied", "You can only transfer events to a user in your city.");
  }
  let eventDocs = [];
  if (Array.isArray(eventIds) && eventIds.length > 0) {
    if (eventIds.length > 500) throw new HttpsError("invalid-argument", "Select 500 events or fewer.");
    eventDocs = await Promise.all(eventIds.map(id => db.collection("events").doc(String(id)).get()));
  } else {
    if (!fromUid) throw new HttpsError("invalid-argument", "fromUid or eventIds required.");
    const snap = await db.collection("events").where("createdByUserId","==",fromUid).get();
    eventDocs = snap.docs;
  }
  let batch = db.batch(); let count = 0;
  for (const doc of eventDocs) {
    if (!doc.exists) continue;
    if (!adminCanAccessEvent(callerData, doc.data() || {})) {
      throw new HttpsError("permission-denied", "One or more selected events are outside your city.");
    }
    batch.update(doc.ref, {
      createdByUserId: toUid,
      createdByName:   toData.fullName || toData.email || "",
      createdByUserEmail: toData.email || "",
      isOnBehalfOf: false,
      submittedByName: admin.firestore.FieldValue.delete(),
      submittedByRole: admin.firestore.FieldValue.delete(),
      ownershipTransferredAt: admin.firestore.FieldValue.serverTimestamp(),
      ownershipTransferredByUid: request.auth.uid,
      ownershipTransferredByName: callerData.fullName || callerData.email || "",
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    });
    count++;
    if (count % 450 === 0) { await batch.commit(); batch = db.batch(); }
  }
  if (count % 450 !== 0) await batch.commit();
  return { transferred: count };
});
exports.adminUnbanUser = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    // Verify caller is Super Admin. Unban can restore roles and old profile
    // data, so it must not be available to city admins.
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const role = callerDoc.data()?.role;
    if (role !== "superAdmin")
      throw new HttpsError("permission-denied", "Super Admin access required.");

    const { bannedDocId, uid, email, fullName } = request.data;
    if (!bannedDocId) throw new HttpsError("invalid-argument", "Missing bannedDocId.");

    // Remove ban document
    await db.collection("bannedUsers").doc(bannedDocId).delete();

    // Restore user profile â€” use all data saved at ban time
    if (uid) {
      const userRef  = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        const { role, phone, phoneVerified } = request.data;
        await userRef.set({
          uid:           uid,
          email:         email         || "",
          fullName:      fullName      || "",
          role:          role          || "user",  // restore original role
          phone:         phone         || "",
          phoneVerified: phoneVerified || false,
          createdAt:     admin.firestore.FieldValue.serverTimestamp(),
          updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Profile exists but may have wrong role â€” restore original
        const { role } = request.data;
        if (role && userSnap.data().role !== role) {
          await userRef.update({ role, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
      }
    }

    console.log(`User unbanned: ${email} by ${request.auth.uid}`);
    return { success: true };
  }
);

// â”€â”€â”€ EMAIL HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const APP_URL = 'https://communityevents.siza.info';
const APP_DOWNLOAD_URL = 'https://download.communityevents.siza.info';

exports.submitAiContentReport = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use POST." });
      return;
    }

    try {
      const body = req.body || {};
      const reason = String(body.reason || "").trim().slice(0, 120);
      const comments = String(body.comments || "").trim().slice(0, 2000);
      const source = String(body.source || "deep-stories-email").trim().slice(0, 120);
      const contentTitle = String(body.contentTitle || "").trim().slice(0, 250);
      const contentUrl = String(body.contentUrl || "").trim().slice(0, 1000);
      const userEmail = String(body.userEmail || "").trim().toLowerCase().slice(0, 254);

      if (!reason) {
        res.status(400).json({ error: "Please select a reason." });
        return;
      }
      if (!contentTitle && !contentUrl) {
        res.status(400).json({ error: "Missing content details." });
        return;
      }

      await db.collection("ai_reports").add({
        source,
        reason,
        comments,
        contentTitle,
        contentUrl,
        userEmail,
        userId: "public-email-report",
        userRole: "public",
        prompt: `Deep Stories content report\nTitle: ${contentTitle || "Not provided"}\nURL: ${contentUrl || "Not provided"}`,
        aiResponse: comments || "No additional comments provided.",
        page: "deep-stories-report-page",
        appVersion: "email-link",
        userAgent: String(req.get("user-agent") || "").slice(0, 500),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[AI Content Report] Failed to submit report", err);
      res.status(500).json({ error: "Could not submit report. Please try again." });
    }
  }
);

// Email the support inbox whenever a user reports an AI-generated response.
exports.onAiReportCreated = onDocumentCreated(
  { document: 'ai_reports/{reportId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const report = event.data?.data();
    const reportId = event.params.reportId;
    if (!report) return;

    // Eventarc delivery is at-least-once. Skip a retry after successful mail.
    if (report.emailNotificationSentAt) return;

    const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
    if (!transporter) {
      console.error(`[AI Report] SMTP is not configured for report ${reportId}`);
      return;
    }

    const createdAt = report.createdAt?.toDate?.() || new Date();
    const createdLabel = createdAt.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const consoleUrl = `https://console.firebase.google.com/project/community-event-8b639/firestore/databases/-default-/data/~2Fai_reports~2F${encodeURIComponent(reportId)}`;

    await sendEventEmail(transporter, {
      ...emailEnvelope({ SMTP_HOST, SMTP_USER, EMAIL_FROM }, 'admin'),
      to: 'communityeventssydney@gmail.com',
      subject: `[AI Response Report] ${String(report.reason || 'Review required').slice(0, 120)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2937">
          <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-top:0">
            <p><strong>Reason:</strong> ${escapeHtml(report.reason || 'Not provided')}</p>
            <p><strong>Comments:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.comments || 'No additional comments')}</div>
            <p><strong>User:</strong> ${escapeHtml(report.userEmail || report.userId || 'Guest')}</p>
            <p><strong>Role:</strong> ${escapeHtml(report.userRole || 'Unknown')}</p>
            <p><strong>Reported:</strong> ${escapeHtml(createdLabel)}</p>
            <p><strong>App version:</strong> ${escapeHtml(report.appVersion || 'Unknown')}</p>
            <p><strong>User prompt:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.prompt || 'Not recorded')}</div>
            <p><strong>AI response:</strong></p>
            <div style="white-space:pre-wrap;background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px">${escapeHtml(report.aiResponse || 'Not recorded')}</div>
            <p style="margin-top:20px"><a href="${consoleUrl}" style="color:#b91c1c;font-weight:bold">Open report in Firebase Console</a></p>
          </div>
        </div>`,
    });

    await event.data.ref.update({
      emailNotificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
      emailNotificationRecipient: 'communityeventssydney@gmail.com',
    });
    console.log(`[AI Report] Notification sent for ${reportId}`);
  }
);

function buildStoreAnnouncementEmail() {
  const stores = [
    ['App Store', 'Download for iPhone & iPad', 'https://apps.apple.com/au/app/community-events-australia/id6782770347'],
    ['Google Play', 'Download for Android', 'https://play.google.com/store/apps/details?id=info.siza.communityevents.app'],
    ['Microsoft Store', 'Download for Windows PC', 'https://apps.microsoft.com/detail/9NDGJZHL86KJ'],
  ];
  return `<p style="margin:0 0 16px">Community Connect is available on Google Play, the App Store and Microsoft Store.</p>
    ${stores.map(([name, description, url]) => `<a href="${escapeHtml(url)}" style="display:block;margin:10px 0;padding:14px;border:1px solid #d7e4e1;border-radius:8px;color:#138477;text-decoration:none;overflow-wrap:anywhere"><strong style="display:block;font-size:18px">${escapeHtml(name)}</strong><span style="font-size:16px;color:#46545d">${escapeHtml(description)}</span></a>`).join('')}
    <p>You can also use the web app on any device:<br><a href="https://communityevents.siza.info" style="color:#138477;overflow-wrap:anywhere">communityevents.siza.info</a></p>`;
}

// Unsubscribe footer added to every user-facing email
function unsubscribeFooter(uid = '') {
  const fnUrl = 'https://australia-southeast1-community-event-8b639.cloudfunctions.net/unsubscribeEmail';
  const unsubUrl = uid
    ? `${fnUrl}?uid=${uid}`
    : APP_URL;
  return `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center">
      <p style="font-size:11px;color:#9ca3af;line-height:1.6;margin:0">
        You are receiving this email because you registered with Community Connect.<br/>
        <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline">Unsubscribe from reminder emails</a>
        &nbsp;&middot;&nbsp;
        <a href="${APP_DOWNLOAD_URL}" style="color:#6b7280;text-decoration:underline">Open / Download App</a>
        &nbsp;&middot;&nbsp;
        <a href="mailto:support@siza.info" style="color:#6b7280;text-decoration:underline">Contact Us</a>
      </p>
    </div>`;
}

// â”€â”€â”€ SUPER ADMIN NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function notifySuperAdmin(subject, bodyHtml, secrets, scopeCity = "all") {
  try {
    // Fetch in application code rather than relying on an exact role query.
    // Some historical/migrated profiles can have legacy role shapes; this
    // keeps admin alerts aligned with the app's current permission model.
    const usersSnap = await db.collection('users').get();
    const scopedCity = scopeCity === "all" ? "all" : normalizeCity(scopeCity);
    const adminProfiles = usersSnap.docs
      .map(docSnap => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter(profile => isActiveDeliverableUser(profile))
      .filter(profile => {
        if (isSuperAdminProfile(profile)) return true;
        return isAdminProfile(profile) && userInCityScope(profile, scopedCity);
      });

    // Aggregate by email. If duplicate active records exist, prefer the
    // current phone-linked profile, then the highest role.
    const profileByEmail = new Map();
    for (const profile of adminProfiles) {
      const email = String(profile.email || '').trim().toLowerCase();
      if (!email.includes('@')) continue;
      const score = (isSuperAdminProfile(profile) ? 300 : 200) +
        (hasAnyPhoneProfile(profile) ? 20 : 0) +
        (profile.migratedFromUid ? 5 : 0);
      const existing = profileByEmail.get(email);
      if (!existing || score > existing.score) {
        profileByEmail.set(email, { profile, score });
      }
    }
    const emails = [...profileByEmail.entries()]
      .filter(([, entry]) => entry.profile.adminAlertEmailEnabled !== false)
      .map(([email]) => email);

    if (emails.length === 0) return;

    const transporter = buildTransporter(secrets);
    await sendEventEmail(transporter, {
      ...emailEnvelope(secrets, 'admin'),
      to:   emails.join(', '),
      subject,
      html: bodyHtml,
    });
    console.log(`Admin notification sent to ${emails.length} opted-in administrators for ${scopedCity}:`, emails);
  } catch (e) {
    console.warn('notifySuperAdmin failed:', e.message);
  }
}

// Event created notification
exports.onEventCreated = onDocumentCreated(
  { document: 'events/{eventId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const data     = event.data?.data();
    const eventId  = event.params.eventId;
    if (!data || data.status !== 'active') return;

    await notifySuperAdmin(
      `${EMAIL_ICON_NEW_EVENT} New event added: ${data.eventType} - ${data.hostName}`,
      detailRows([
        ['Type', data.eventType], ['Host', data.hostName],
        ['Date', `${data.eventDate} at ${data.startTime}`], ['Suburb', data.address?.suburb || 'N/A'],
        ['Organiser', data.organiserType], ...(data.hijriDate ? [['Hijri date', data.hijriDate]] : []),
        ['Added by', data.createdByName || data.createdByUserId],
      ]),
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM },
      getEventMetroArea(data)
    );
  }
);

// Event deleted notification
exports.onEventDeleted = onDocumentDeleted(
  { document: 'events/{eventId}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const data    = event.data?.data();
    if (!data) return;

    // Scheduled expiry moves the document atomically to archivedEvents. That
    // is not a user deletion and must not generate a deletion alert.
    const archived = await db.collection('archivedEvents').doc(event.params.eventId).get();
    if (archived.exists && archived.data()?.archiveReason === 'event_date_expired') return;

    await notifySuperAdmin(
      `${EMAIL_ICON_DELETE} Event deleted: ${data.eventType} - ${data.hostName}`,
      detailRows([
        ['Type', data.eventType], ['Host', data.hostName], ['Date', data.eventDate],
        ['Suburb', data.address?.suburb || 'N/A'], ['Originally added by', data.createdByName || data.createdByUserId],
      ]),
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM },
      getEventMetroArea(data)
    );
  }
);

// New user signup notification
exports.onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', region: REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (event) => {
    const uid = event.params.uid;

    // Wait 3 seconds â€” phone users get their email/name saved in a
    // subsequent updateDoc call right after the initial setDoc.
    // This ensures the trigger reads the fully populated document.
    await new Promise(r => setTimeout(r, 3000));

    // Re-read the document to get the latest data including email/name
    const freshSnap = await db.collection('users').doc(uid).get();
    const data = freshSnap.exists ? freshSnap.data() : event.data?.data();
    if (!data) return;
    const userLocation = cityLabel(getUserCity(data));

    await notifySuperAdmin(
      `${EMAIL_ICON_USER} New user registered: ${data.fullName || 'Unknown'}`,
      detailRows([
        ['Name', data.fullName || 'Not provided'], ['Email', data.email || 'Not provided'],
        ['Phone', data.phone || 'Not provided'], ['Location', userLocation], ['Role', data.role],
        ['Registered', new Date().toLocaleString('en-AU', {timeZone:'Australia/Sydney'})],
      ]),
      { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM },
      getUserCity(data)
    );
  }
);

// â”€â”€â”€ UNSUBSCRIBE EMAIL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.unsubscribeEmail = onRequest(
  { region: REGION },
  async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const uid = req.query.uid;

    // Show confirmation page if no action yet (GET with uid)
    // Handle empty uid from old buggy emails
    if (req.method === 'GET' && !uid) {
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribe - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 20px; color: #1f2937; margin: 14px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 16px; }
    a.btn { display: block; padding: 12px; border-radius: 12px; font-size: 14px;
      font-weight: 600; text-decoration: none; margin-bottom: 10px; }
    .btn-teal { background: #0f766e; color: white; }
    .btn-grey { background: #f3f4f6; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:44px">ðŸ”•</div>
    <h1>Unsubscribe from Reminders</h1>
    <p>This link has expired. To unsubscribe, please open the app and turn off reminders in your Profile, or email us and we'll remove you manually.</p>
    <a class="btn btn-teal" href="https://communityevents.siza.info">Open App â†’ Profile â†’ Settings</a>
    <a class="btn btn-grey" href="mailto:communityeventssydney@gmail.com?subject=Unsubscribe%20Request">Email Us to Unsubscribe</a>
  </div>
</body>
</html>`);
      return;
    }

    if (req.method === 'GET' && uid && !req.query.confirm) {
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribe - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 21px; color: #1f2937; margin: 16px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 20px; }
    .btn { display: block; width: 100%; padding: 13px; border-radius: 12px;
      font-size: 15px; font-weight: 600; cursor: pointer; border: none;
      margin-bottom: 10px; text-decoration: none; }
    .btn-red  { background: #dc2626; color: white; }
    .btn-grey { background: #f3f4f6; color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">ðŸ”•</div>
    <h1>Unsubscribe from Reminders</h1>
    <p>You will no longer receive event reminder emails from Community Events Australia. You can re-enable reminders anytime from your profile in the app.</p>
    <a class="btn btn-red" href="?uid=${uid}&confirm=1">Yes, Unsubscribe Me</a>
    <a class="btn btn-grey" href="https://communityevents.siza.info">â† Back to App</a>
  </div>
</body>
</html>`);
      return;
    }

    // Process unsubscribe (GET with confirm=1)
    if (!uid) {
      res.set('Content-Type', 'text/html');
      res.status(400).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>âŒ Invalid unsubscribe link</h2>
        <p>Please contact <a href="mailto:communityeventssydney@gmail.com">communityeventssydney@gmail.com</a></p>
      </body></html>`);
      return;
    }

    try {
      await db.collection('users').doc(uid).update({
        reminderEmailEnabled: false,
        unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      res.set('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Unsubscribed - Community Events</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #f0f9f7; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 36px 28px;
      max-width: 400px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
      text-align: center; }
    h1 { font-size: 21px; color: #1f2937; margin: 16px 0 10px; }
    p  { font-size: 14px; color: #6b7280; line-height: 1.6; margin-bottom: 20px; }
    a  { display: block; width: 100%; padding: 13px; border-radius: 12px;
      font-size: 15px; font-weight: 600; background: #0f766e; color: white;
      text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px">âœ…</div>
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive reminder emails. You can re-enable reminders anytime from your Profile in the app.</p>
    <a href="https://communityevents.siza.info">â† Back to App</a>
  </div>
</body>
</html>`);
    } catch (e) {
      console.error('Unsubscribe error:', e.message);
      res.set('Content-Type', 'text/html');
      res.status(500).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2>âŒ Something went wrong</h2>
        <p>Please contact <a href="mailto:communityeventssydney@gmail.com">communityeventssydney@gmail.com</a></p>
      </body></html>`);
    }
  }
);

// â”€â”€â”€ SEND LIVE NOTIFICATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.notifyEventLive = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new Error('Unauthenticated');
  const { eventId, eventTitle, hostName } = request.data || {};
  if (!eventId || !eventTitle) throw new Error('Missing eventId or eventTitle');
  const [callerSnap, eventSnap] = await Promise.all([
    db.collection('users').doc(request.auth.uid).get(),
    db.collection('events').doc(eventId).get(),
  ]);
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const callerData = callerSnap.data() || {};
  const eventData = eventSnap.data() || {};
  if (eventData.createdByUserId !== request.auth.uid && !adminCanAccessEvent(callerData, eventData)) {
    throw new HttpsError('permission-denied', 'You can only notify users for events in your city.');
  }
  const eventCity = getEventMetroArea(eventData);

  // Get all active user FCM tokens. Older web tokens are stored as a map,
  // while some legacy rows may still have an array.
  const usersSnap = await db.collection('users').get();
  const tokens = [];
  usersSnap.forEach(doc => {
    const u = doc.data();
    if (!isActiveDeliverableUser(u) || !pushNotificationsEnabled(u)) return;
    if (!userInCityScope(u, eventCity)) return;
    tokens.push(...getUserFcmTokens(u));
  });

  if (tokens.length === 0) return { sent: 0 };

  // Send FCM push to all tokens in batches of 500
  const { getMessaging } = require('firebase-admin/messaging');
  const messaging = getMessaging();
  const batches = [];
  for (let i = 0; i < tokens.length; i += 500) {
    batches.push(tokens.slice(i, i + 500));
  }

  let sent = 0;
  for (const batch of batches) {
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: `${EMAIL_ICON_LIVE} Event is Live Now!`,
          body: `${eventTitle} by ${hostName} is streaming live. Tap to watch!`,
        },
        data: { eventId, type: 'live' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
      sent += res.successCount;
    } catch (e) {
      console.error('FCM batch error:', e.message);
    }
  }

  return { sent };
});

exports.sendTestPushNotification = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const userRef = db.collection('users').doc(request.auth.uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');

  const user = userSnap.data();
  if (!pushNotificationsEnabled(user)) {
    throw new HttpsError('failed-precondition', 'Push notifications are disabled for this account.');
  }

  const entries = getUserFcmTokenEntries(user);
  const tokens = entries.map(entry => entry.token);
  const tokenSummary = entries.reduce((acc, entry) => {
    const key = `${entry.platform || 'unknown'}:${entry.source || 'unknown'}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  if (tokens.length === 0) return { sent: 0, tokenCount: 0, tokenSummary, failures: [] };

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Community Events notifications are working',
      body: 'You will receive enabled event alerts on this device.',
    },
    data: { type: 'test', url: APP_DOWNLOAD_URL },
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });

  const updates = {};
  const failures = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const entry = entries[i] || {};
      failures.push({
        platform: entry.platform || 'unknown',
        source: entry.source || 'unknown',
        code: r.error?.code || 'unknown',
      });
      if (invalidFcmTokenCodes(r.error?.code)) {
        updates[`fcmTokens.${tokens[i]}`] = admin.firestore.FieldValue.delete();
      }
    }
  });
  if (Object.keys(updates).length > 0) await userRef.update(updates);

  return {
    sent: res.successCount,
    tokenCount: tokens.length,
    tokenSummary,
    failures,
    invalidRemoved: Object.keys(updates).length,
  };
});

// â”€â”€â”€ GUEST EVENT EDIT â€” OTP SEND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.sendEditOtp = onCall(
  { region: REGION, secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    const { eventId, contact } = request.data;
    if (!eventId || !contact) throw new HttpsError("invalid-argument", "Missing eventId or contact.");

    // Fetch event
    const eventDoc = await db.collection("events").doc(eventId).get();
    if (!eventDoc.exists) throw new HttpsError("not-found", "Event not found.");
    const e = eventDoc.data();

    // Normalize inputs for flexible matching
    const normalize = s => String(s || '').replace(/[\s\-().+]/g, '').toLowerCase()
      .replace(/^61(\d{9})$/, '0$1');
    const inputNorm = normalize(contact);

    // Fields to match against
    const candidates = [
      e.hostPhone,
      e.hostContactOptional,
      e.createdByUserEmail
    ].filter(Boolean).map(normalize);

    const matched = candidates.some(c => c === inputNorm);
    if (!matched) {
      throw new HttpsError("not-found",
        "No match found. Please enter the exact phone number or email stored on this event."
      );
    }

    // Generate 6-digit OTP
    const otp   = Math.floor(100000 + Math.random() * 900000).toString();
    const token = require("crypto").randomBytes(32).toString("hex");
    const expiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP in Firestore
    await db.collection("editOtps").doc(token).set({
      eventId, otp, expiry, contact: inputNorm,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Determine if contact is email or phone
    const isEmail = contact.includes('@');

    if (isEmail) {
      // Send via email
      const transporter = buildTransporter({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS });
      await sendEventEmail(transporter, {
        ...emailEnvelope({ SMTP_HOST, SMTP_USER, EMAIL_FROM }, 'updates'),
        to:   contact.trim(),
        subject: `${EMAIL_ICON_KEY} Community Events - Your edit verification code`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
            <div style="padding:16px;background:#f9fafb;border-radius:8px">
              <p>Your verification code to edit your event:</p>
              <div data-email-otp style="font-size:28px;font-weight:900;text-align:center;white-space:nowrap;
                color:#0f766e;letter-spacing:3px;padding:12px;
                background:white;border-radius:8px;border:2px solid #0f766e;margin:16px 0">
                ${otp}
              </div>
              <p style="color:#6b7280;font-size:13px">
                This code expires in 10 minutes. If you did not request this, ignore this email.
              </p>
            </div>
          </div>`
      });
    } else {
      // For phone: store OTP and return a message
      // Full SMS would need Twilio â€” for now we return the OTP in the response
      // with a note (or you can add Twilio later)
      // For community use, we can show it on screen or send via email fallback
      console.log(`OTP for ${contact}: ${otp}`); // visible in logs for admin debugging
      // Return token â€” client will show "check your email" or admin can see in logs
    }

    return { token, method: isEmail ? 'email' : 'sms' };
  }
);

// â”€â”€â”€ GUEST EVENT EDIT â€” OTP VERIFY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.verifyEditOtp = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    const { token, otp, eventId } = request.data;
    if (!token || !otp || !eventId) throw new HttpsError("invalid-argument", "Missing fields.");

    const otpDoc = await db.collection("editOtps").doc(token).get();
    if (!otpDoc.exists) throw new HttpsError("not-found", "Invalid or expired verification code.");

    const data = otpDoc.data();

    // Check expiry
    if (Date.now() > data.expiry) {
      await otpDoc.ref.delete();
      throw new HttpsError("deadline-exceeded", "Verification code has expired. Please request a new one.");
    }

    // Check OTP matches
    if (data.otp !== otp.trim()) {
      throw new HttpsError("invalid-argument", "Incorrect verification code. Please try again.");
    }

    // Check eventId matches
    if (data.eventId !== eventId) {
      throw new HttpsError("invalid-argument", "Verification code does not match this event.");
    }

    // Grant edit session â€” store in Firestore with 30min expiry
    const sessionToken = require("crypto").randomBytes(32).toString("hex");
    await db.collection("editSessions").doc(sessionToken).set({
      eventId,
      contact: data.contact,
      expiry:  Date.now() + 30 * 60 * 1000,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Clean up OTP
    await otpDoc.ref.delete();

    return { sessionToken };
  }
);

// â”€â”€â”€ YOUTUBE OAUTH2 FLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const YT_REDIRECT_URI = "https://australia-southeast1-community-event-8b639.cloudfunctions.net/youtubeOAuthCallback";
const YT_SCOPES       = "https://www.googleapis.com/auth/youtube";

// Step 1 â€” Generate OAuth URL for admin to visit once
exports.youtubeOAuthUrl = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID] },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const clientId = YOUTUBE_CLIENT_ID.value();
    const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(YT_REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(YT_SCOPES)}` +
      `&access_type=offline` +
      `&prompt=consent`;

    return { url };
  }
);

// Step 2 â€” Handle OAuth callback, exchange code for tokens, store in Firestore
exports.youtubeOAuthCallback = onRequest(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (req, res) => {
    console.log("[YouTube OAuth] Callback hit. Query params:", JSON.stringify(req.query));
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
      console.error("[YouTube OAuth] Google returned error:", error, req.query.error_description);
      res.status(400).send(`Google OAuth error: ${error} - ${req.query.error_description || ''}`);
      return;
    }

    if (!code) {
      res.status(400).send("Missing code parameter. Params: " + JSON.stringify(req.query));
      return;
    }

    try {
      const clientId     = YOUTUBE_CLIENT_ID.value();
      const clientSecret = YOUTUBE_CLIENT_SECRET.value();

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     clientId,
          client_secret: clientSecret,
          redirect_uri:  YT_REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      console.log("[YouTube OAuth] Token response:", JSON.stringify({
        ...tokens, access_token: "REDACTED", refresh_token: tokens.refresh_token ? "PRESENT" : "MISSING"
      }));

      if (!tokens.access_token) {
        res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:20px">
            <h2>âš ï¸ OAuth Error</h2>
            <p><strong>Error:</strong> ${tokens.error || 'Unknown'}</p>
            <p><strong>Description:</strong> ${tokens.error_description || 'None'}</p>
            <p><strong>Full response:</strong> <pre>${JSON.stringify(tokens, null, 2)}</pre></p>
          </body></html>
        `);
        return;
      }

      // Get existing refresh token if not provided (Google only sends it once)
      let refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        const existing = await db.collection("system").doc("youtube_oauth").get();
        refreshToken = existing.data()?.refresh_token || null;
        console.log(`[YouTube OAuth] No refresh token in response, existing in DB: ${refreshToken ? 'YES' : 'NO'}`);
      }

      if (!refreshToken) {
        res.status(400).send(`
          <html><body style="font-family:sans-serif;padding:20px">
            <h2>âš ï¸ No Refresh Token</h2>
            <p>Google didn't send a refresh token. This usually means you've authorized this app before.</p>
            <p>Token response keys received: <strong>${Object.keys(tokens).join(', ')}</strong></p>
            <p>Please try these steps:</p>
            <ol>
              <li>Go to <a href="https://myaccount.google.com/connections" target="_blank">myaccount.google.com/connections</a></li>
              <li>Sign in as communityeventssydney@gmail.com</li>
              <li>Find and remove Community Events access</li>
              <li>Try connecting again</li>
            </ol>
          </body></html>
        `);
        return;
      }

      // Store tokens securely in Firestore
      await db.collection("system").doc("youtube_oauth").set({
        access_token:  tokens.access_token,
        refresh_token: refreshToken,
        expiry_date:   Date.now() + (tokens.expires_in * 1000),
        scope:         tokens.scope,
        updatedAt:     new Date().toISOString(),
      });

      res.send(`
        <html>
        <head><meta http-equiv="refresh" content="3;url=https://communityevents.siza.info"></head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8f9fa">
          <div style="max-width:400px;margin:0 auto;background:white;padding:40px;border-radius:20px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
            <div style="font-size:60px;margin-bottom:16px">âœ…</div>
            <h2 style="color:#27ae60;margin:0 0 12px">YouTube Connected!</h2>
            <p style="color:#666;margin:0 0 24px">Community Events is now connected to your YouTube channel.</p>
            <p style="color:#666;margin:0 0 24px">Redirecting you back to the app in 3 secondsâ€¦</p>
            <a href="https://communityevents.siza.info" style="background:#27ae60;color:white;border:none;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-block">
              Return to App Now
            </a>
          </div>
        </body></html>
      `);
    } catch (e) {
      console.error("[YouTube OAuth] Error:", e.message);
      res.status(500).send(`Error: ${e.message}`);
    }
  }
);

// Helper â€” get valid access token (refreshes if expired)
async function getYouTubeAccessToken() {
  const snap = await db.collection("system").doc("youtube_oauth").get();
  if (!snap.exists) throw new Error("YouTube not connected. Please authenticate first.");

  const data = snap.data();
  const clientId     = YOUTUBE_CLIENT_ID.value();
  const clientSecret = YOUTUBE_CLIENT_SECRET.value();

  // Refresh if expired or expiring within 5 minutes
  if (!data.access_token || Date.now() > (data.expiry_date - 300000)) {
    console.log("[YouTube] Refreshing access token...");
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: data.refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "refresh_token",
      }),
    });

    const refreshed = await refreshRes.json();
    if (!refreshed.access_token) throw new Error("Failed to refresh YouTube token.");

    await db.collection("system").doc("youtube_oauth").update({
      access_token: refreshed.access_token,
      expiry_date:  Date.now() + (refreshed.expires_in * 1000),
    });

    return refreshed.access_token;
  }

  return data.access_token;
}

const YOUTUBE_THUMBNAIL_TEMPLATE = path.join(__dirname, "assets", "youtube-stream-thumbnail-template.png");

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCaseLoose(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.toLowerCase().replace(/\b([a-z])/g, match => match.toUpperCase())
    .replace(/\bNsw\b/g, "NSW")
    .replace(/\bAct\b/g, "ACT")
    .replace(/\bQld\b/g, "QLD")
    .replace(/\bA\.s\.\b/gi, "A.S.");
}

function wrapSvgLines(text, maxChars = 31, maxLines = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

function getThumbnailTimeZone(eventData = {}) {
  const explicit = eventData.timeZone || eventData.timezone || eventData.eventTimeZone;
  if (explicit) return explicit;
  const state = String(eventData.address?.state || "").trim().toUpperCase();
  if (state === "WA") return "Australia/Perth";
  if (state === "SA") return "Australia/Adelaide";
  if (state === "QLD") return "Australia/Brisbane";
  if (state === "NT") return "Australia/Darwin";
  if (state === "TAS") return "Australia/Hobart";
  if (state === "VIC") return "Australia/Melbourne";
  return "Australia/Sydney";
}

function cleanThumbText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function formatThumbDate(dateStr = "", timeZone = "Australia/Sydney") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
  const date = new Date(`${dateStr}T12:00:00+10:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  });
}

function buildThumbnailFields(eventData = {}, fallbackTitle = "") {
  const address = eventData.address || {};
  const timeZone = getThumbnailTimeZone(eventData);
  const type = cleanThumbText(eventData.eventTypeDisplay || eventData.eventType || fallbackTitle || "Community Event");
  const subject = cleanThumbText(eventData.eventSubject || "");
  const host = cleanThumbText(eventData.hostName || eventData.organiserName || eventData.createdByName || "");
  const suburb = cleanThumbText(address.suburb || eventData.suburb || "");
  const date = formatThumbDate(eventData.eventDate, timeZone);
  const time = [eventData.startTime, eventData.endTime].filter(Boolean).join(" - ");
  return {
    type,
    subject,
    host,
    suburb,
    date,
    time: cleanThumbText(time),
    bottomLine: `${type || "Event"} streamed through Community Events Australia`,
  };
}

async function generateYouTubeThumbnailBuffer(eventData = {}, fallbackTitle = "") {
  const fields = buildThumbnailFields(eventData, fallbackTitle);
  const subjectLines = wrapSvgLines(fields.subject || "Community Live Stream", 33, 2);
  const hostLines = wrapSvgLines(fields.host || "Community Events Australia", 30, 1);
  const suburbLines = wrapSvgLines(fields.suburb || "Australia", 31, 1);
  const dateLines = wrapSvgLines(fields.date || "", 30, 1);
  const timeLine = fields.time || "";
  const bottomLines = wrapSvgLines(fields.bottomLine, 42, 2);

  const textLine = (value, x, y, size, color = "#071733", weight = 800) =>
    `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeSvgText(value)}</text>`;

  const svg = `
    <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">
      <rect x="490" y="160" width="480" height="440" rx="18" fill="#ffffff" fill-opacity="1"/>
      <line x1="508" y1="238" x2="938" y2="238" stroke="#b8d9d4" stroke-width="2"/>
      <line x1="508" y1="330" x2="938" y2="330" stroke="#b8d9d4" stroke-width="2"/>
      <line x1="508" y1="408" x2="938" y2="408" stroke="#b8d9d4" stroke-width="2"/>
      <line x1="508" y1="488" x2="938" y2="488" stroke="#b8d9d4" stroke-width="2"/>
      ${textLine(fields.type || "Community Event", 508, 212, 42, "#0f766e", 900)}
      ${subjectLines.map((line, index) => textLine(line, 508, 282 + index * 38, index === 0 ? 31 : 26, index === 0 ? "#071733" : "#475569", index === 0 ? 900 : 700)).join("")}
      ${hostLines.map((line, index) => textLine(line, 508, 382 + index * 36, 34, "#071733", 900)).join("")}
      ${suburbLines.map((line, index) => textLine(line, 508, 462 + index * 36, 33, "#071733", 900)).join("")}
      ${dateLines.map((line, index) => textLine(line, 508, 530 + index * 30, 28, "#071733", 900)).join("")}
      ${timeLine ? textLine(timeLine, 508, 570, 25, "#0f766e", 900) : ""}
      <rect x="462" y="620" width="560" height="68" rx="34" fill="#0f766e"/>
      ${bottomLines.map((line, index) => textLine(line, 542, 646 + index * 23, 22, index === 0 ? "#ffffff" : "#facc15", 800)).join("")}
    </svg>`;

  return sharp(YOUTUBE_THUMBNAIL_TEMPLATE)
    .resize(1280, 720, { fit: "cover" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function uploadYouTubeThumbnail(accessToken, videoId, imageBuffer) {
  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
        "Content-Length": String(imageBuffer.length),
      },
      body: imageBuffer,
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `Thumbnail upload failed (${response.status})`);
  }
  return payload;
}

async function setStreamThumbnailForVideo({ videoId, eventData = {}, fallbackTitle = "" }) {
  if (!videoId) return { ok: false, reason: "missing-video-id" };
  const accessToken = await getYouTubeAccessToken();
  const imageBuffer = await generateYouTubeThumbnailBuffer(eventData, fallbackTitle);
  await uploadYouTubeThumbnail(accessToken, videoId, imageBuffer);
  await db.collection("streamVideos").doc(videoId).set({
    customThumbnailSetAt: new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, bytes: imageBuffer.length };
}

function eventDataFromStreamRecord(data = {}) {
  const parts = String(data.youtubeTitle || data.eventTitle || "")
    .split(/\s+[—-]\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  const type = data.eventTypeDisplay || data.eventType || parts[0] || "Community Event";
  const host = data.hostName || parts[1] || "";
  const subject = data.eventSubject || (
    parts.length >= 3
      ? parts.slice(2).join(" - ")
      : (parts.length === 2 && parts[1] !== host ? parts[1] : "")
  );
  return {
    eventType: type,
    eventTypeDisplay: type,
    eventSubject: subject,
    hostName: host,
    eventDate: data.eventDate || "",
    startTime: data.startTime || "",
    endTime: data.endTime || "",
    address: {
      suburb: data.suburb || data.address?.suburb || "",
      state: data.state || data.address?.state || "",
      postcode: data.postcode || data.address?.postcode || "",
    },
  };
}

// Step 3 â€” Create a new YouTube broadcast and return stream URL
async function createYouTubeBroadcast(accessToken, title, privacyStatus = 'public') {
  const now       = new Date();
  const startTime = new Date(now.getTime() + 5000).toISOString(); // near-immediate start for native RTMPS

  // Create broadcast
  const broadcastRes = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,contentDetails,status",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title:            title || "Community Events Live Stream",
          scheduledStartTime: startTime,
          description:      "Live streamed via Community Events Australia app",
        },
        status: {
          privacyStatus,
          selfDeclaredMadeForKids: false,
        },
        contentDetails: {
          enableAutoStart: true,
          // Keep the broadcast alive through temporary mobile/network loss.
          // Explicit End Stream still transitions it to complete immediately.
          enableAutoStop:  false,
          enableDvr:       true,
          recordFromStart: true,
          latencyPreference: "ultraLow",
          monitorStream: {
            enableMonitorStream: false,
          },
        },
      }),
    }
  );

  const broadcast = await broadcastRes.json();
  console.log("[YouTube] Broadcast created:", JSON.stringify(broadcast).slice(0, 300));
  if (!broadcast.id) throw new Error(broadcast.error?.message || "Failed to create broadcast");

  // Bind broadcast to the default stream
  const streamRes = await fetch(
    "https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        snippet: { title: title || "Community Events Stream" },
        cdn: {
          frameRate:     "variable",
          ingestionType: "rtmp",
          resolution:    "variable",
        },
      }),
    }
  );

  const stream = await streamRes.json();
  console.log("[YouTube] Stream created:", JSON.stringify(stream).slice(0, 300));
  if (!stream.id) throw new Error(stream.error?.message || "Failed to create stream");

  // Bind stream to broadcast
  await fetch(
    `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcast.id}&part=id,contentDetails&streamId=${stream.id}`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
    }
  );

  const streamKey = stream.cdn?.ingestionInfo?.streamName;
  const rtmpUrl   = stream.cdn?.ingestionInfo?.ingestionAddress;
  const rtmpsUrl  = stream.cdn?.ingestionInfo?.rtmpsIngestionAddress;

  console.log(`[YouTube] Stream ID: ${stream.id}, streamKey present: ${!!streamKey}, rtmpUrl: ${rtmpUrl}, rtmpsUrl: ${rtmpsUrl}`);

  if (!streamKey || !rtmpUrl) {
    // Fetch stream again to get ingestion info
    const streamFetchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveStreams?part=id,cdn&id=${stream.id}`,
      { headers: { "Authorization": `Bearer ${accessToken}` } }
    );
    const streamFetchData = await streamFetchRes.json();
    const fetchedStream = streamFetchData.items?.[0];
    console.log(`[YouTube] Fetched stream:`, JSON.stringify(fetchedStream?.cdn?.ingestionInfo).slice(0, 300));
    return {
      broadcastId: broadcast.id,
      streamId:    stream.id,
      streamKey:   fetchedStream?.cdn?.ingestionInfo?.streamName,
      rtmpUrl:     fetchedStream?.cdn?.ingestionInfo?.ingestionAddress,
      rtmpsUrl:    fetchedStream?.cdn?.ingestionInfo?.rtmpsIngestionAddress,
      watchUrl:    `https://www.youtube.com/watch?v=${broadcast.id}`,
    };
  }

  return {
    broadcastId: broadcast.id,
    streamId:    stream.id,
    streamKey,
    rtmpUrl,
    rtmpsUrl,
    watchUrl:    `https://www.youtube.com/watch?v=${broadcast.id}`,
  };
}

// Check if YouTube is connected
exports.youtubeConnectionStatus = onCall(
  { region: REGION },
  async (request) => {
    const { HttpsError } = require("firebase-functions/v2/https");
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

    const snap = await db.collection("system").doc("youtube_oauth").get();
    return { connected: snap.exists && !!snap.data()?.refresh_token };
  }
);

// --- SHARED: Stale live event cleanup logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function completeYouTubeBroadcastIfLive(broadcastId) {
  if (!broadcastId) return;
  try {
    const accessToken = await getYouTubeAccessToken();
    const statusRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status&id=${broadcastId}`,
      { headers:{ 'Authorization':`Bearer ${accessToken}` } }
    );
    const statusData = await statusRes.json();
    const lifeCycle = statusData.items?.[0]?.status?.lifeCycleStatus;
    if (lifeCycle === 'live' || lifeCycle === 'liveStarting' || lifeCycle === 'testing') {
      await fetch(
        `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=status`,
        { method:'POST', headers:{ 'Authorization':`Bearer ${accessToken}`, 'Content-Length':'0' } }
      );
    }
  } catch (error) {
    console.error(`[NativeStream] Could not complete stale broadcast ${broadcastId}:`, error.message);
  }
}

async function markStreamVideoCompleted(videoRecordId) {
  if (!videoRecordId) return;
  await db.collection('streamVideos').doc(videoRecordId).set({
    status: 'completed',
    endedAt: new Date().toISOString(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).catch(error => {
    console.warn(`[StreamVideos] Could not complete ${videoRecordId}:`, error.message);
  });
}

async function syncStreamVideoAvailability({ force = false } = {}) {
  const healthRef = db.collection('system').doc('stream_video_catalog_health');
  const healthSnap = await healthRef.get();
  const lastCheckedAt = new Date(healthSnap.data()?.checkedAt || 0).getTime();
  if (!force && Date.now() - lastCheckedAt < 60 * 60 * 1000) return;

  const catalogSnap = await db.collection('streamVideos').orderBy('startedAt', 'desc').limit(100).get();
  const checkable = catalogSnap.docs.filter(docSnap => {
    const data = docSnap.data();
    return !!data.videoId && data.status !== 'live' && data.status !== 'active';
  });
  if (!checkable.length) {
    await healthRef.set({ checkedAt: new Date().toISOString() }, { merge: true });
    return;
  }

  const accessToken = await getYouTubeAccessToken();
  const availableIds = new Set();
  const youtubeTitleById = new Map();
  for (let offset = 0; offset < checkable.length; offset += 50) {
    const ids = checkable.slice(offset, offset + 50).map(docSnap => docSnap.data().videoId);
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id,snippet&id=${encodeURIComponent(ids.join(','))}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const payload = await response.json();
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || `YouTube availability check failed (${response.status})`);
    }
    (payload.items || []).forEach(item => {
      availableIds.add(item.id);
      if (item.snippet?.title) youtubeTitleById.set(item.id, item.snippet.title);
    });
  }

  const checkedAt = new Date().toISOString();
  const batch = db.batch();
  checkable.forEach(docSnap => {
    batch.set(docSnap.ref, {
      youtubeAvailable: availableIds.has(docSnap.data().videoId),
      youtubeCheckedAt: checkedAt,
      ...(youtubeTitleById.get(docSnap.data().videoId) ? { youtubeTitle: youtubeTitleById.get(docSnap.data().videoId) } : {}),
    }, { merge: true });
  });
  batch.set(healthRef, { checkedAt }, { merge: true });
  await batch.commit();
}

async function catalogPublicYouTubeChannelVideos({ force = false } = {}) {
  const catalogVersion = 3;
  const healthRef = db.collection('system').doc('stream_video_youtube_catalog_health');
  const healthSnap = await healthRef.get();
  const lastCheckedAt = new Date(healthSnap.data()?.checkedAt || 0).getTime();
  if (
    !force &&
    healthSnap.data()?.catalogVersion === catalogVersion &&
    Date.now() - lastCheckedAt < 30 * 60 * 1000
  ) return { imported: 0, skipped: true };

  const accessToken = await getYouTubeAccessToken();
  const headers = { 'Authorization': `Bearer ${accessToken}` };
  const channelRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=id,contentDetails&mine=true',
    { headers }
  );
  const channelPayload = await channelRes.json();
  if (!channelRes.ok || channelPayload.error) {
    throw new Error(channelPayload.error?.message || `YouTube channel lookup failed (${channelRes.status})`);
  }
  const channelId = channelPayload.items?.[0]?.id || '';
  const uploadsPlaylistId = channelPayload.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    await healthRef.set({ checkedAt: new Date().toISOString(), imported: 0, catalogVersion, reason: 'missing-uploads-playlist' }, { merge: true });
    return { imported: 0 };
  }

  const videoIds = new Set();
  let pageToken = '';
  while (videoIds.size < 100) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const playlistRes = await fetch(url.toString(), { headers });
    const playlistPayload = await playlistRes.json();
    if (!playlistRes.ok || playlistPayload.error) {
      throw new Error(playlistPayload.error?.message || `YouTube uploads lookup failed (${playlistRes.status})`);
    }
    for (const item of playlistPayload.items || []) {
      if (item.contentDetails?.videoId) videoIds.add(item.contentDetails.videoId);
      if (videoIds.size >= 100) break;
    }
    pageToken = playlistPayload.nextPageToken || '';
    if (!pageToken) break;
  }

  if (channelId) {
    pageToken = '';
    while (videoIds.size < 100) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'id');
      url.searchParams.set('channelId', channelId);
      url.searchParams.set('type', 'video');
      url.searchParams.set('order', 'date');
      url.searchParams.set('maxResults', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const searchRes = await fetch(url.toString(), { headers });
      const searchPayload = await searchRes.json();
      if (!searchRes.ok || searchPayload.error) {
        console.warn('[StreamVideos] YouTube channel search skipped:', searchPayload.error?.message || `YouTube channel search failed (${searchRes.status})`);
        break;
      }
      for (const item of searchPayload.items || []) {
        if (item.id?.videoId) videoIds.add(item.id.videoId);
        if (videoIds.size >= 100) break;
      }
      pageToken = searchPayload.nextPageToken || '';
      if (!pageToken) break;
    }
  }

  const videoIdList = [...videoIds];
  if (!videoIdList.length) {
    await healthRef.set({ checkedAt: new Date().toISOString(), imported: 0, catalogVersion }, { merge: true });
    return { imported: 0 };
  }

  let imported = 0;
  const checkedAt = new Date().toISOString();
  for (let offset = 0; offset < videoIdList.length; offset += 50) {
    const ids = videoIdList.slice(offset, offset + 50);
    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=id,snippet,status,liveStreamingDetails&id=${encodeURIComponent(ids.join(','))}`,
      { headers }
    );
    const videoPayload = await videoRes.json();
    if (!videoRes.ok || videoPayload.error) {
      throw new Error(videoPayload.error?.message || `YouTube videos lookup failed (${videoRes.status})`);
    }

    const batch = db.batch();
    for (const item of videoPayload.items || []) {
      if (item.status?.privacyStatus !== 'public') continue;
      const existingByVideoId = await db.collection('streamVideos').where('videoId', '==', item.id).limit(1).get();
      const ref = existingByVideoId.empty
        ? db.collection('streamVideos').doc(item.id)
        : existingByVideoId.docs[0].ref;
      const existing = existingByVideoId.empty ? await ref.get() : existingByVideoId.docs[0];
      const snippet = item.snippet || {};
      const startedAt = item.liveStreamingDetails?.actualStartTime || snippet.publishedAt || checkedAt;
      batch.set(ref, {
        videoId: item.id,
        watchUrl: `https://www.youtube.com/watch?v=${item.id}`,
        youtubeTitle: snippet.title || 'Community Event Stream',
        eventTitle: snippet.title || 'Community Event Stream',
        source: existing.exists ? (existing.data()?.source || 'youtube-channel') : 'youtube-channel',
        privacyStatus: 'public',
        appVisibility: 'public',
        status: existing.exists ? (existing.data()?.status || 'completed') : 'completed',
        startedAt: existing.exists ? (existing.data()?.startedAt || startedAt) : startedAt,
        youtubeAvailable: true,
        youtubeCheckedAt: checkedAt,
        cataloguedFromYouTubeAt: checkedAt,
      }, { merge: true });
      if (!existing.exists) imported++;
    }
    await batch.commit();
  }

  await healthRef.set({ checkedAt, imported, catalogVersion }, { merge: true });
  console.log(`[StreamVideos] YouTube catalogue checked ${videoIdList.length} videos; imported ${imported}.`);
  return { imported };
}

// Returns stream metadata to everyone, but only registered users receive the
// YouTube URL. This is enforced server-side so guests cannot recover unlisted
// links by inspecting Firestore or the network response.
exports.listStreamVideos = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
  const isRegistered = !!request.auth?.uid
    && request.auth.token.firebase?.sign_in_provider !== 'anonymous';

  // Lazily catalogue older native streams created before streamVideos existed.
  const legacySnap = await db.collection('nativeStreamSessions').orderBy('createdAt', 'desc').limit(100).get();
  const eligibleLegacy = legacySnap.docs.filter(docSnap => !!docSnap.data()?.broadcastId);
  if (eligibleLegacy.length) {
    const existing = await Promise.all(eligibleLegacy.map(docSnap =>
      db.collection('streamVideos').doc(docSnap.data().broadcastId).get()
    ));
    const missing = eligibleLegacy.filter((docSnap, index) => !existing[index]?.exists);
    if (missing.length) {
      const eventDocs = await Promise.all(missing.map(docSnap => {
        const eventId = docSnap.data()?.eventId;
        return eventId ? db.collection('events').doc(eventId).get() : Promise.resolve(null);
      }));
      const batch = db.batch();
      missing.forEach((docSnap, index) => {
        const session = docSnap.data();
        const eventData = eventDocs[index]?.exists ? eventDocs[index].data() : {};
        batch.set(db.collection('streamVideos').doc(session.broadcastId), {
          videoId: session.broadcastId,
          watchUrl: session.watchUrl || `https://www.youtube.com/watch?v=${session.broadcastId}`,
          eventId: session.eventId || null,
          eventTitle: eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream',
          eventDate: eventData.eventDate || '',
          eventType: eventData.eventType || '',
          eventTypeDisplay: eventData.eventTypeDisplay || eventData.eventType || '',
          eventSubject: eventData.eventSubject || '',
          hostName: eventData.hostName || '',
          organiserType: eventData.organiserType || '',
          startTime: eventData.startTime || '',
          endTime: eventData.endTime || '',
          suburb: eventData.address?.suburb || '',
          state: eventData.address?.state || '',
          postcode: eventData.address?.postcode || '',
          ownerUid: eventData.createdByUserId || session.uid || '',
          startedByUid: session.uid || '',
          source: 'native',
          privacyStatus: 'public',
          status: ['stopped', 'ended'].includes(session.status) ? 'completed' : (session.status || 'completed'),
          startedAt: session.createdAt || '',
          endedAt: session.stoppedAt || session.endedAt || null,
          legacy: true,
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  await catalogPublicYouTubeChannelVideos().catch(error => {
    console.warn('[StreamVideos] YouTube channel catalogue skipped:', error.message);
  });

  await syncStreamVideoAvailability({ force: true }).catch(error => {
    // A temporary YouTube/API error must not make the archive disappear.
    console.warn('[StreamVideos] Availability sync skipped:', error.message);
  });

  const snap = await db.collection('streamVideos').orderBy('startedAt', 'desc').limit(500).get();
  const videos = [];
  const seenVideoIds = new Set();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.youtubeAvailable === false) continue;
    if (data.appVisibility === 'private') continue;
    const videoKey = data.videoId || docSnap.id;
    if (videoKey && seenVideoIds.has(videoKey)) continue;
    if (videoKey) seenVideoIds.add(videoKey);
    const item = {
      id: docSnap.id,
      eventId: data.eventId || null,
      eventTitle: data.youtubeTitle || data.eventTitle || 'Community Event Stream',
      eventDate: data.eventDate || '',
      hostName: data.hostName || '',
      organiserType: data.organiserType || '',
      source: data.source || 'native',
      streamCategory: ['external-youtube', 'youtube-channel'].includes(data.source)
        ? 'other-device'
        : 'same-device',
      privacyStatus: data.privacyStatus === 'unlisted' ? 'unlisted' : 'public',
      appVisibility: data.appVisibility === 'private' ? 'private' : 'public',
      status: data.status || 'completed',
      startedAt: data.startedAt || '',
      endedAt: data.endedAt || null,
    };
    if (isRegistered) {
      item.videoId = data.videoId || '';
      item.watchUrl = data.watchUrl || null;
    }
    videos.push(item);
  }

  return { videos, canWatch: isRegistered };
  }
);

exports.refreshStreamVideoThumbnails = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'superAdmin') {
      throw new HttpsError('permission-denied', 'Super Admin access required.');
    }

    const limit = Math.max(1, Math.min(Number(request.data?.limit || 10), 25));
    const force = request.data?.force === true;
    const snap = await db.collection('streamVideos').orderBy('startedAt', 'desc').limit(100).get();
    const candidates = snap.docs
      .filter(docSnap => docSnap.data().youtubeAvailable !== false)
      .filter(docSnap => !!docSnap.data().videoId)
      .filter(docSnap => force || !docSnap.data().customThumbnailSetAt)
      .slice(0, limit);

    let updated = 0;
    const errors = [];
    for (const docSnap of candidates) {
      const data = docSnap.data();
      let eventData = eventDataFromStreamRecord(data);
      if (data.eventId) {
        const eventSnap = await db.collection('events').doc(data.eventId).get();
        if (eventSnap.exists) {
          eventData = eventSnap.data();
        } else {
          const archivedSnap = await db.collection('archivedEvents').doc(data.eventId).get();
          if (archivedSnap.exists) eventData = archivedSnap.data();
        }
      }
      try {
        await setStreamThumbnailForVideo({
          videoId: data.videoId,
          eventData,
          fallbackTitle: data.youtubeTitle || data.eventTitle || 'Community Event Stream',
        });
        updated++;
      } catch (error) {
        errors.push({ id: docSnap.id, videoId: data.videoId, message: error.message });
      }
    }

    return {
      updated,
      attempted: candidates.length,
      errors,
      message: `Updated ${updated} of ${candidates.length} stream thumbnail${candidates.length === 1 ? '' : 's'}.`,
    };
  }
);

let publicEventsCache = { expiresAt: 0, events: [] };

async function runStaleLiveCleanup() {
  const snap = await db.collection('events').where('isLive', '==', true).get();
  if (snap.empty) return 0;
  let ended = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const sessionId = data.liveUrl; // liveUrl stores the nativeStream sessionId
    const startedAt = data.liveStartedAt ? new Date(data.liveStartedAt) : null;
    const hoursLive = startedAt ? (Date.now() - startedAt.getTime()) / 3600000 : 999;

    // Safety net â€” force end if live for more than 3 hours, or no session at all
    if (!sessionId || hoursLive > 3) {
      await markStreamVideoCompleted(data.liveVideoRecordId);
      await docSnap.ref.update({ isLive: false, liveUrl: null, liveWatchUrl: null, liveAppVisibility: null,
        liveVideoRecordId: null, liveEndedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      ended++; continue;
    }

    try {
      const sessDoc = await db.collection('nativeStreamSessions').doc(sessionId).get();
      const sessionData = sessDoc.exists ? sessDoc.data() : null;
      const status = sessionData?.status || 'ended';
      const resumeExpired = status === 'interrupted'
        && new Date(sessionData?.resumeUntil || 0).getTime() < Date.now();
      // Interrupted sessions remain visible during the recovery window so the
      // host can resume the same YouTube URL.
      if (status === 'ended' || status === 'stopped' || resumeExpired) {
        if (resumeExpired && sessionData?.broadcastId) {
          await completeYouTubeBroadcastIfLive(sessionData.broadcastId);
          await sessDoc.ref.update({ status:'stopped', stoppedAt:new Date().toISOString() }).catch(() => {});
        }
        await markStreamVideoCompleted(sessionData?.broadcastId);
        await docSnap.ref.update({ isLive: false, liveUrl: null, liveWatchUrl: null, liveAppVisibility: null,
          liveVideoRecordId: null, liveEndedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        ended++;
      }
    } catch (e) { console.error(`[Cleanup] Error checking session ${sessionId}:`, e.message); }
  }
  if (ended > 0) console.log(`[Cleanup] Ended ${ended} stale live event(s)`);
  return ended;
}

// â”€â”€â”€ CALLABLE: Immediate cleanup (called from client on stream end) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Named differently from the scheduled version to avoid Firebase trigger-type conflict
exports.cleanupStaleLiveEventsNow = onCall(
  { region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async () => {
    const ended = await runStaleLiveCleanup();
    return { ended };
  }
);

// â”€â”€â”€ SCHEDULED: Clean up stale live events every 10 minutes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.cleanupStaleLiveEvents = onSchedule(
  { schedule: 'every 2 minutes', region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async () => { await runStaleLiveCleanup(); }
);


// â”€â”€â”€ NATIVE STREAM: Start session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns a Cloud Run WebSocket URL for the native streaming relay.
// The Cloud Run container (deployed separately) accepts WebSocket connections,
// receives binary MediaRecorder chunks, and pipes them through FFmpeg to YouTube RTMP.
//
// This function:
//   1. Creates a YouTube broadcast via OAuth (or uses a manual stream key)
//   2. Returns the Cloud Run WebSocket URL + YouTube watch URL to the client
//
// NOTE: Cloud Run container must be deployed separately â€” see /streaming-relay/README.md
// Until deployed, this returns a mock URL so the frontend test UI can be developed.
exports.nativeStreamStart = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { useOAuth, manualRtmpKey, eventTitle, eventId, qualityProfile, audioMode, testMode, protocolVersion, directNative } = request.data || {};
    const privacyStatus = request.data?.privacyStatus === 'unlisted' ? 'unlisted' : 'public';
    const appVisibility = privacyStatus === 'unlisted' ? 'private' : 'public';
    let eventData = null;
    if (eventId) {
      const eventSnap = await db.collection('events').doc(eventId).get();
      if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
      eventData = eventSnap.data();
    }
    const requiresAdminCheck = eventData
      ? eventData.createdByUserId !== request.auth.uid
      : protocolVersion === 2;
    if (requiresAdminCheck) {
      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      const callerData = userSnap.data() || {};
      if (!adminCanAccessEvent(callerData, eventData || {})) {
        throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
      }
    }
    if (eventData?.isLive && eventData.liveUrl) {
      throw new HttpsError('failed-precondition', 'This event already has an active or resumable stream.');
    }

    let rtmpUrl   = null;
    let watchUrl  = null;
    let broadcastId = null;

    // â”€â”€ Get RTMP target â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const resolvedStreamTitle = eventTitle || eventData?.eventSubject || eventData?.eventTypeDisplay || eventData?.eventType || 'Community Events Live Stream';

    if (useOAuth) {
      try {
        const accessToken = await getYouTubeAccessToken();
        const broadcast   = await createYouTubeBroadcast(accessToken, resolvedStreamTitle, privacyStatus);
        // Use RTMPS (port 443) â€” Cloud Run blocks outbound port 1935 (plain RTMP)
        const ingestBase = broadcast.rtmpsUrl || broadcast.rtmpUrl;
        rtmpUrl     = `${ingestBase}/${broadcast.streamKey}`;
        watchUrl    = broadcast.watchUrl;
        broadcastId = broadcast.broadcastId;
        console.log(`[NativeStream] YouTube broadcast created: ${broadcastId}, using ${broadcast.rtmpsUrl ? 'RTMPS:443' : 'RTMP:1935'}`);
      } catch (e) {
        console.error('[NativeStream] OAuth/broadcast failed:', e.message);
        console.error('[NativeStream] Stack:', e.stack?.slice(0, 500));
        throw new HttpsError('internal',
          `YouTube setup failed: ${e.message}. If this mentions token/auth, go to Admin Dashboard â†’ Settings â†’ reconnect YouTube.`);
      }
    } else if (manualRtmpKey) {
      // RTMPS on port 443 â€” Cloud Run blocks outbound port 1935 (plain RTMP)
      rtmpUrl  = `rtmps://a.rtmps.youtube.com/live2/${manualRtmpKey}`;
      watchUrl = `https://www.youtube.com/channel/UC9AvesDamQvU7idD2OD1R6w/live`;
    } else {
      throw new HttpsError('invalid-argument', 'Either useOAuth=true or manualRtmpKey required.');
    }

    // â”€â”€ Get Cloud Run WebSocket URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const RELAY_URL = process.env.NATIVE_STREAM_RELAY_URL
      || 'wss://native-stream-relay-209723097611.australia-southeast1.run.app';

    const sessionId = `ns_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const streamToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(streamToken).digest('hex');

    // Store session in Firestore so relay can validate it
    try {
      await db.collection('nativeStreamSessions').doc(sessionId).set({
        uid:        request.auth.uid,
        eventId: eventId || null,
        rtmpUrl,
        broadcastId: broadcastId || null,
        watchUrl:    watchUrl || null,
        createdAt:   new Date().toISOString(),
        status:      'pending',
        tokenHash,
        protocolVersion: protocolVersion === 2 ? 2 : 1,
        qualityProfile: ['1080p','720p','480p'].includes(qualityProfile) ? qualityProfile : '720p',
        audioMode: audioMode === 'speech' ? 'speech' : 'natural',
        privacyStatus,
        appVisibility,
        resumeUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      // Publish the resumable session before returning to the phone. If
      // Android reloads the page or the network drops after this point, the
      // next attempt resumes this session instead of creating another
      // YouTube broadcast.
      if (eventId) {
        await db.collection('events').doc(eventId).update({
          isLive: true,
          liveUrl: sessionId,
          liveRoomCode: sessionId,
          liveWatchUrl: appVisibility === 'public' ? (watchUrl || null) : null,
          liveSource: 'native',
          liveAppVisibility: appVisibility,
          liveVideoRecordId: broadcastId || null,
          liveStartedAt: new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (broadcastId) {
        await db.collection('streamVideos').doc(broadcastId).set({
          videoId: broadcastId,
          watchUrl,
          eventId: eventId || null,
          eventTitle: resolvedStreamTitle,
          youtubeTitle: resolvedStreamTitle,
          eventDate: eventData?.eventDate || '',
          eventType: eventData?.eventType || '',
          eventTypeDisplay: eventData?.eventTypeDisplay || eventData?.eventType || '',
          eventSubject: eventData?.eventSubject || '',
          hostName: eventData?.hostName || '',
          organiserType: eventData?.organiserType || '',
          startTime: eventData?.startTime || '',
          endTime: eventData?.endTime || '',
          suburb: eventData?.address?.suburb || '',
          state: eventData?.address?.state || '',
          postcode: eventData?.address?.postcode || '',
          ownerUid: eventData?.createdByUserId || request.auth.uid,
          startedByUid: request.auth.uid,
          source: 'native',
          privacyStatus,
          appVisibility,
          status: 'live',
          startedAt: new Date().toISOString(),
          endedAt: null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStreamThumbnailForVideo({
          videoId: broadcastId,
          eventData: eventData || {},
          fallbackTitle: resolvedStreamTitle,
        }).catch(error => {
          console.warn(`[StreamThumbnails] Could not set thumbnail for ${broadcastId}:`, error.message);
        });
      }
    } catch (e) {
      console.error('[NativeStream] Firestore session write failed:', e.message, e.code);
      throw new HttpsError('internal', 'Failed to create session in Firestore: ' + e.message);
    }

    const wsUrl = `${RELAY_URL}/stream?session=${sessionId}`;
    console.log(`[NativeStream] Session ${sessionId} created for uid ${request.auth.uid}`);
    return {
      wsUrl,
      watchUrl,
      sessionId,
      streamToken,
      ...(directNative ? { rtmpUrl } : {}),
      rtmpTarget: rtmpUrl.replace(/\/[^/]+$/, '/REDACTED'),
    };
  }
);

// â”€â”€â”€ NATIVE STREAM: Resume the same YouTube broadcast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.nativeStreamResume = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { eventId, sessionId, directNative } = request.data || {};
    if (!eventId || !sessionId) throw new HttpsError('invalid-argument', 'eventId and sessionId required.');

    const [eventSnap, sessionSnap] = await Promise.all([
      db.collection('events').doc(eventId).get(),
      db.collection('nativeStreamSessions').doc(sessionId).get(),
    ]);
    if (!eventSnap.exists || !sessionSnap.exists) throw new HttpsError('not-found', 'Stream session not found.');
    const eventData = eventSnap.data();
    const session = sessionSnap.data();
    if (session.eventId !== eventId || eventData.liveUrl !== sessionId) {
      throw new HttpsError('failed-precondition', 'This session does not belong to the selected event.');
    }
    if (eventData.createdByUserId !== request.auth.uid) {
      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      const callerData = userSnap.data() || {};
      if (!adminCanAccessEvent(callerData, eventData || {})) {
        throw new HttpsError('permission-denied', 'Not authorised to resume this event.');
      }
    }
    if (session.status === 'stopped') throw new HttpsError('failed-precondition', 'This stream was ended explicitly.');
    const leaseExpiry = new Date(session.leaseExpiresAt || 0).getTime();
    if (session.activeConnectionId && leaseExpiry > Date.now()) {
      throw new HttpsError('failed-precondition', 'This stream is still active on another device.');
    }
    const resumeUntil = new Date(session.resumeUntil || 0).getTime();
    if (session.status === 'interrupted' && resumeUntil && resumeUntil < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'The resume window has expired.');
    }

    const streamToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(streamToken).digest('hex');
    await sessionSnap.ref.update({
      tokenHash,
      status: 'pending',
      resumedBy: request.auth.uid,
      resumedAt: new Date().toISOString(),
      resumeUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      activeConnectionId: null,
      leaseExpiresAt: null,
    });

    const relayUrl = process.env.NATIVE_STREAM_RELAY_URL
      || 'wss://native-stream-relay-209723097611.australia-southeast1.run.app';
    return {
      wsUrl: `${relayUrl}/stream?session=${sessionId}`,
      watchUrl: session.watchUrl,
      sessionId,
      streamToken,
      ...(directNative ? { rtmpUrl: session.rtmpUrl } : {}),
      qualityProfile: session.qualityProfile || '720p',
      audioMode: session.audioMode || 'natural',
    };
  }
);

exports.sendPrivateStreamLinkEmail = onCall(
  { region: REGION, secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const sessionId = String(request.data?.sessionId || '').trim();
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');

    const sessionRef = db.collection('nativeStreamSessions').doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) throw new HttpsError('not-found', 'Stream session not found.');
    const session = sessionSnap.data();

    let eventData = {};
    if (session.eventId) {
      const eventSnap = await db.collection('events').doc(session.eventId).get();
      if (eventSnap.exists) eventData = eventSnap.data();
    }

    if (session.uid !== request.auth.uid) {
      const userSnap = await db.collection('users').doc(request.auth.uid).get();
      const callerData = userSnap.data() || {};
      if (!adminCanAccessEvent(callerData, eventData || {})) {
        throw new HttpsError('permission-denied', 'Not authorised to email this private stream link.');
      }
    }

    if (session.appVisibility !== 'private' && session.privacyStatus !== 'unlisted') {
      return { sent: false, reason: 'not-private' };
    }
    if (!session.watchUrl) return { sent: false, reason: 'missing-url' };

    const streamVideoRef = session.broadcastId
      ? db.collection('streamVideos').doc(session.broadcastId)
      : null;

    return sendPrivateStreamLinkToHost({
      secrets: { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM },
      uid: session.uid,
      eventData,
      watchUrl: session.watchUrl,
      sessionRef,
      streamVideoRef,
    });
  }
);

// â”€â”€â”€ NATIVE STREAM: Stop session â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.nativeStreamStop = onCall(
  { region: REGION, secrets:[YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { sessionId } = request.data || {};
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');

    const sessRef = db.collection('nativeStreamSessions').doc(sessionId);
    const sess    = await sessRef.get();
    if (!sess.exists) throw new HttpsError('not-found', 'Session not found.');
    if (sess.data().uid !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your session.');

    await sessRef.update({ status: 'stopped', stoppedAt: new Date().toISOString() });
    await completeYouTubeBroadcastIfLive(sess.data().broadcastId);
    await markStreamVideoCompleted(sess.data().broadcastId);
    console.log(`[NativeStream] Session ${sessionId} stopped`);
    return { ok: true };
  }
);

// Connect a YouTube Live broadcast created on another device to an event.
exports.startExternalYouTubeStream = onCall(
  { region: REGION, secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const eventId = String(request.data?.eventId || '').trim();
  const rawUrl = String(request.data?.youtubeUrl || '').trim();
  const privacyStatus = request.data?.privacyStatus === 'unlisted' ? 'unlisted' : 'public';
  const appVisibility = privacyStatus === 'unlisted' ? 'private' : 'public';
  if (!eventId || !rawUrl) throw new HttpsError('invalid-argument', 'Event and YouTube URL are required.');

  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const eventData = eventSnap.data();
  const isOwner = eventData.createdByUserId === request.auth.uid;
  if (!isOwner) {
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = userSnap.data() || {};
    if (!adminCanAccessEvent(callerData, eventData || {})) {
      throw new HttpsError('permission-denied', 'Not authorised to stream this event.');
    }
  }
  if (eventData.isLive) throw new HttpsError('failed-precondition', 'This event is already live.');

  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new HttpsError('invalid-argument', 'Enter a valid YouTube video URL.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  let videoId = '';
  if (host === 'youtu.be') videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  if (host === 'youtube.com') {
    if (parsed.pathname === '/watch') videoId = parsed.searchParams.get('v') || '';
    else if (/^\/(live|embed|shorts)\//.test(parsed.pathname)) videoId = parsed.pathname.split('/')[2] || '';
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    throw new HttpsError('invalid-argument', 'Use a YouTube video link such as youtube.com/watch?v=... or youtu.be/...');
  }
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  let videoTitle = eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream';

  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    const payload = await response.json();
    if (payload?.title) videoTitle = payload.title;
  } catch (error) {
    console.warn(`[ExternalStream] URL verification failed for ${videoId}: ${error.message}`);
    throw new HttpsError('invalid-argument', 'YouTube could not verify this video. Make sure it is available, then try again.');
  }

  const now = new Date().toISOString();
  const videoRecordId = `external_${videoId}_${eventId}`;
  await eventRef.update({
    isLive:true,
    liveUrl:null,
    liveWatchUrl:appVisibility === 'public' ? watchUrl : null,
    liveSource:'external-youtube',
    liveAppVisibility:appVisibility,
    liveStartedAt:now,
    liveStartedBy:request.auth.uid,
    liveVideoRecordId:videoRecordId,
    updatedAt:now,
  });
  await db.collection('streamVideos').doc(videoRecordId).set({
    videoId,
    watchUrl,
    eventId,
    eventTitle:eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream',
    youtubeTitle:videoTitle,
    eventDate:eventData.eventDate || '',
    eventType:eventData.eventType || '',
    eventTypeDisplay:eventData.eventTypeDisplay || eventData.eventType || '',
    eventSubject:eventData.eventSubject || '',
    hostName:eventData.hostName || '',
    organiserType:eventData.organiserType || '',
    startTime:eventData.startTime || '',
    endTime:eventData.endTime || '',
    suburb:eventData.address?.suburb || '',
    state:eventData.address?.state || '',
    postcode:eventData.address?.postcode || '',
    ownerUid:eventData.createdByUserId || request.auth.uid,
    startedByUid:request.auth.uid,
    source:'external-youtube',
    privacyStatus,
    appVisibility,
    status:'live',
    startedAt:now,
    endedAt:null,
    createdAt:admin.firestore.FieldValue.serverTimestamp(),
  }, { merge:true });
  if (appVisibility === 'private') {
    try {
      await sendPrivateStreamLinkToHost({
        secrets: { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM },
        uid: request.auth.uid,
        eventData,
        watchUrl,
        streamVideoRef: db.collection('streamVideos').doc(videoRecordId),
      });
    } catch (error) {
      console.warn(`[ExternalStream] Could not email private stream link for ${videoRecordId}:`, error.message);
    }
  }
  setStreamThumbnailForVideo({
    videoId,
    eventData,
    fallbackTitle: videoTitle || eventData.eventSubject || eventData.eventTypeDisplay || eventData.eventType || 'Community Event Stream',
  }).catch(error => {
    console.warn(`[StreamThumbnails] Could not set external thumbnail for ${videoId}:`, error.message);
  });
  console.log(`[ExternalStream] Event ${eventId} linked to YouTube video ${videoId} by ${request.auth.uid}`);
  return { ok:true, watchUrl, videoId };
});

exports.endExternalYouTubeStream = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const eventId = String(request.data?.eventId || '').trim();
  if (!eventId) throw new HttpsError('invalid-argument', 'eventId required.');

  const eventRef = db.collection('events').doc(eventId);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const eventData = eventSnap.data();
  const isOwner = eventData.createdByUserId === request.auth.uid;
  if (!isOwner) {
    const userSnap = await db.collection('users').doc(request.auth.uid).get();
    const callerData = userSnap.data() || {};
    if (!adminCanAccessEvent(callerData, eventData || {})) {
      throw new HttpsError('permission-denied', 'Not authorised to end this live event.');
    }
  }
  if (eventData.liveSource !== 'external-youtube') {
    throw new HttpsError('failed-precondition', 'This event is not using an external YouTube stream.');
  }

  const now = new Date().toISOString();
  await markStreamVideoCompleted(eventData.liveVideoRecordId);
  await eventRef.update({
    isLive:false,
    liveUrl:null,
    liveWatchUrl:null,
    liveAppVisibility:null,
    liveSource:null,
    liveVideoRecordId:null,
    liveEndedAt:now,
    updatedAt:now,
  });
  console.log(`[ExternalStream] Event ${eventId} ended in app by ${request.auth.uid}`);
  return { ok:true };
});

// â”€â”€â”€ NATIVE STREAM: Check YouTube stream health (diagnostic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns the streamStatus of the bound liveStream â€” tells us if YouTube
// is receiving valid data ('active') or not ('ready'/'error'/'inactive').
exports.nativeStreamCheckHealth = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { sessionId } = request.data || {};
    if (!sessionId) throw new HttpsError('invalid-argument', 'sessionId required.');

    const sess = await db.collection('nativeStreamSessions').doc(sessionId).get();
    if (!sess.exists) throw new HttpsError('not-found', 'Session not found.');
    const { broadcastId } = sess.data();
    if (!broadcastId) return { error: 'No broadcastId â€” manual key mode, cannot check health' };

    const accessToken = await getYouTubeAccessToken();

    // Get the broadcast to find the bound stream ID
    const bRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=contentDetails,status&id=${broadcastId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const bData = await bRes.json();
    const item = bData.items?.[0];
    const streamId = item?.contentDetails?.boundStreamId;
    const broadcastStatus = item?.status?.lifeCycleStatus;

    if (!streamId) return { broadcastStatus, streamStatus: 'no-bound-stream', healthStatus: null };

    // Get the stream's health status
    const sRes = await fetch(
      `https://www.googleapis.com/youtube/v3/liveStreams?part=status&id=${streamId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    const sData = await sRes.json();
    const streamStatus = sData.items?.[0]?.status?.streamStatus;
    const healthStatus = sData.items?.[0]?.status?.healthStatus;

    console.log(`[NativeStream] Health check â€” broadcast: ${broadcastStatus}, stream: ${streamStatus}, health:`, JSON.stringify(healthStatus));

    // If stream is active but broadcast hasn't transitioned, manually transition it
    if (streamStatus === 'active' && broadcastStatus !== 'live' && broadcastStatus !== 'complete') {
      let nextStatus = broadcastStatus;
      let transitioned = false;

      if (broadcastStatus === 'ready') {
        console.log('[NativeStream] Stream active but broadcast is ready - transitioning to testing');
        const testingRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=testing&id=${broadcastId}&part=status`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const testingData = await testingRes.json();
        console.log('[NativeStream] Testing transition result:', JSON.stringify(testingData).slice(0, 300));
        if (testingData.status?.lifeCycleStatus) {
          nextStatus = testingData.status.lifeCycleStatus;
          transitioned = true;
        }
      }

      if (nextStatus === 'testing' || broadcastStatus === 'testing') {
        console.log('[NativeStream] Stream active - transitioning broadcast to live');
        const liveRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${broadcastId}&part=status`,
          { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const liveData = await liveRes.json();
        console.log('[NativeStream] Live transition result:', JSON.stringify(liveData).slice(0, 300));
        if (liveData.status?.lifeCycleStatus) {
          nextStatus = liveData.status.lifeCycleStatus;
          transitioned = true;
        }
      }

      return { broadcastStatus: nextStatus, streamStatus, healthStatus, transitioned };
    }

    if (streamStatus === 'active' && broadcastStatus === 'ready') {
      console.log('[NativeStream] Stream active but broadcast not live â€” transitioning to live');
      const tRes = await fetch(
        `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=live&id=${broadcastId}&part=status`,
        { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const tData = await tRes.json();
      console.log('[NativeStream] Transition result:', JSON.stringify(tData).slice(0, 300));
      return { broadcastStatus: tData.status?.lifeCycleStatus || broadcastStatus, streamStatus, healthStatus, transitioned: true };
    }

    return { broadcastStatus, streamStatus, healthStatus, transitioned: false };
  }
);

// â”€â”€â”€ NATIVE STREAM: End event (robust server-side cleanup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Called by the host when confirming "End Stream". Directly clears isLive on
// the event AND marks the relay session as stopped â€” bypasses any client-side
// race conditions between session-status checks and Firestore writes.
exports.nativeStreamEndEvent = onCall(
  { region: REGION, secrets: [YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login required.');
    const { eventId, sessionId } = request.data || {};
    if (!eventId) throw new HttpsError('invalid-argument', 'eventId required.');

    const eventRef = db.collection('events').doc(eventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

    const eventData = eventSnap.data();
    const isOwner = eventData.createdByUserId === request.auth.uid;
    if (!isOwner) {
      const userDoc = await db.collection('users').doc(request.auth.uid).get();
      const callerData = userDoc.data() || {};
      if (!adminCanAccessEvent(callerData, eventData || {})) {
        throw new HttpsError('permission-denied', 'Not your event.');
      }
    }

    // 1. Get broadcastId from session so we can end the YouTube broadcast cleanly
    let broadcastId = null;
    if (sessionId) {
      const sessRef = db.collection('nativeStreamSessions').doc(sessionId);
      const sessSnap = await sessRef.get().catch(() => null);
      if (sessSnap?.exists) {
        broadcastId = sessSnap.data().broadcastId || null;
        // Mark session stopped
        await sessRef.update({ status: 'stopped', stoppedAt: new Date().toISOString() })
          .catch(e => console.warn('[NativeStream] Session update failed:', e.message));
      }
    }

    // 2. End or delete the YouTube broadcast. If Android created the broadcast
    //    but never delivered media, YouTube leaves it waiting; those are deleted.
    //    Real live broadcasts are transitioned to complete for viewers.
    let youtubeCleanup = { deleted: false, completed: false };
    if (broadcastId) {
      try {
        const accessToken = await getYouTubeAccessToken();
        const statusRes = await fetch(
          `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=status&id=${broadcastId}`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        const statusData = await statusRes.json();
        const lifeCycle = statusData.items?.[0]?.status?.lifeCycleStatus;
        console.log(`[NativeStream] Broadcast ${broadcastId} lifecycle: ${lifeCycle}`);

        if (lifeCycle === 'live' || lifeCycle === 'liveStarting' || lifeCycle === 'testing') {
          const transRes = await fetch(
            `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=status`,
            { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Length': '0' } }
          );
          const transData = await transRes.json();
          if (transData.error) {
            console.error(`[NativeStream] Broadcast transition failed: ${JSON.stringify(transData.error)}`);
            const deleteRes = await fetch(
              `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`,
              { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
            );
            youtubeCleanup.deleted = deleteRes.ok;
            console.log(`[NativeStream] Broadcast ${broadcastId} deleted after failed transition: ${deleteRes.ok}`);
          } else {
            youtubeCleanup.completed = true;
            console.log(`[NativeStream] Broadcast ${broadcastId} transitioned to complete`);
          }
        } else if (lifeCycle === 'complete') {
          youtubeCleanup.completed = true;
          console.log(`[NativeStream] Broadcast ${broadcastId} already complete`);
        } else if (!lifeCycle || lifeCycle === 'created' || lifeCycle === 'ready' || lifeCycle === 'testStarting') {
          const deleteRes = await fetch(
            `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`,
            { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          youtubeCleanup.deleted = deleteRes.ok;
          console.log(`[NativeStream] Waiting broadcast ${broadcastId} deleted: ${deleteRes.ok}`);
        } else {
          console.log(`[NativeStream] Broadcast ${broadcastId} already in state ${lifeCycle} - no transition needed`);
        }
      } catch (e) {
        // Don't fail the whole end-event call if YouTube cleanup fails -
        // the Firestore update below is the critical piece for the app UI
        console.error('[NativeStream] YouTube cleanup error (non-fatal):', e.message);
      }
      if (youtubeCleanup.deleted) {
        await db.collection('streamVideos').doc(broadcastId).set({
          status: 'deleted',
          youtubeAvailable: false,
          endedAt: new Date().toISOString(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }).catch(error => {
          console.warn(`[StreamVideos] Could not mark deleted ${broadcastId}:`, error.message);
        });
      } else {
        await markStreamVideoCompleted(broadcastId);
      }
    }

    // 3. Force-clear isLive on the event â€” source of truth for the app UI
    await eventRef.update({
      isLive:       false,
      liveUrl:      null,
      liveWatchUrl: null,
      liveAppVisibility: null,
      liveSource:   null,
      liveVideoRecordId: null,
      liveEndedAt:  new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    });

    console.log(`[NativeStream] Event ${eventId} ended by ${request.auth.uid}`);
    return { ok: true };
  }
);
