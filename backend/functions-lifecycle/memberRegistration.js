const LEGAL_VERSION = '2026-09-08-community-connect';

function createMemberRegistrationHandlers({ db, auth, serverTimestamp, HttpsError, validateCity = async value => ['sydney','melbourne','canberra','brisbane','adelaide','hobart','perth','rest-of-australia'].includes(value) }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const inactive = data => data.isActive === false || ['banned', 'archived', 'deleted'].includes(data.accountStatus);
  async function complete(request) {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('unauthenticated', 'Sign in with your mobile number first.');
    const data = request.data || {};
    if (typeof data.fullName !== 'string' || typeof data.email !== 'string') fail('invalid-argument', 'Name and email are required.');
    const fullName = data.fullName.trim().replace(/\s+/g, ' ');
    const email = data.email.trim().toLowerCase();
    if (fullName.length < 2 || fullName.length > 120 || /[\u0000-\u001f\u007f]/.test(fullName)) fail('invalid-argument', 'Enter your full name (2–120 characters).');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('invalid-argument', 'Enter a valid email address.');
    if (data.privacyAccepted !== true || data.termsAccepted !== true || data.legalVersion !== LEGAL_VERSION) fail('failed-precondition', 'Please accept the current Privacy Policy and Terms of Use.');
    const account = await auth.getUser(request.auth.uid);
    if (account.disabled) fail('permission-denied', 'This account is inactive.');
    if (!/^\+614\d{8}$/.test(account.phoneNumber || '')) fail('failed-precondition', 'Verify your Australian mobile number first.');
    const ref = db.collection('users').doc(request.auth.uid);
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const existing = snapshot.data() || {};
      if (inactive(existing)) fail('permission-denied', 'This account is inactive.');
      const defaultCity = data.defaultCity || existing.defaultCity;
      if (!await validateCity(defaultCity)) fail('failed-precondition', 'Choose an available default city before continuing.');
      if (existing.defaultCity && data.defaultCity && existing.defaultCity !== data.defaultCity) fail('failed-precondition', 'Change your default city from Profile.');
      const payload = {
        defaultCity,
        fullName, email, emailLower: email, phone: account.phoneNumber, phoneVerified: true,
        privacyAccepted: true, privacyPolicyVersion: LEGAL_VERSION,
        termsAccepted: true, termsVersion: LEGAL_VERSION, legalAcceptedAt: serverTimestamp(),
        profileCompletedAt: existing.profileCompletedAt || serverTimestamp(), updatedAt: serverTimestamp(),
      };
      // Preserve roles/preferences. Never use client UID, role, phone or dates.
      // Completion of an older profile must not replace its original join date.
      if (!existing.registeredAt) payload.registeredAt = snapshot.exists ? snapshot.createTime : serverTimestamp();
      if (!snapshot.exists) Object.assign(payload, { role: 'user', isActive: true, accountStatus: 'active', savedEvents: [], savedBusinesses: [] });
      transaction.set(ref, payload, { merge: true });
    });
    return { completed: true };
  }
  async function recordCreated(event) {
    if (!event.data) return;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(event.data.ref);
      if (!snapshot.exists || snapshot.data()?.registeredAt) return;
      transaction.update(event.data.ref, { registeredAt: snapshot.createTime });
    });
  }
  async function chooseCity(request) {
    if (!request.auth || request.auth.token?.firebase?.sign_in_provider === 'anonymous') fail('unauthenticated', 'Sign in with your mobile number first.');
    const defaultCity = request.data?.defaultCity;
    if (!await validateCity(defaultCity)) fail('invalid-argument', 'Choose an available default city.');
    const account = await auth.getUser(request.auth.uid);
    if (account.disabled || !/^\+614\d{8}$/.test(account.phoneNumber || '')) fail('permission-denied', 'An active verified member account is required.');
    await db.runTransaction(async tx => {
      const ref = db.collection('users').doc(request.auth.uid), snapshot = await tx.get(ref), existing = snapshot.data() || {};
      if (!snapshot.exists || inactive(existing)) fail('permission-denied', 'An active member profile is required.');
      if (!existing.fullName || !existing.email) fail('failed-precondition', 'Complete your name and email first.');
      if (existing.defaultCity && existing.defaultCity !== defaultCity) fail('failed-precondition', 'Change your default city from Profile.');
      tx.set(ref, { defaultCity, updatedAt: serverTimestamp() }, { merge: true });
    });
    return { defaultCity };
  }
  return { complete, chooseCity, recordCreated };
}
module.exports = { createMemberRegistrationHandlers, LEGAL_VERSION };
