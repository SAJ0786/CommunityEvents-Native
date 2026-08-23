import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { deleteUser } from '@react-native-firebase/auth';
import { db, functions } from '../firebase/firebase';

const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'superAdmin',
};

export async function getUserProfile(uid) {
  if (!uid) return null;
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    savedEvents: Array.isArray(data.savedEvents)
      ? data.savedEvents
      : Array.isArray(data.savedEventIds) ? data.savedEventIds : [],
    savedBusinesses: Array.isArray(data.savedBusinesses)
      ? data.savedBusinesses
      : Array.isArray(data.savedBusinessIds) ? data.savedBusinessIds : [],
  };
}

export async function ensureUserProfile(uid, defaults = {}) {
  if (!uid) return null;
  const ref = doc(db, 'users', uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      role: 'user',
      savedEvents: [],
      ...defaults,
    }, { merge: true });
  }
  const current = await getUserProfile(uid);
  if (!current) return null;
  const updates = {};
  if (!current.phone && defaults.phone) updates.phone = defaults.phone;
  if (!current.phoneVerified && defaults.phoneVerified) updates.phoneVerified = true;
  if (!current.email && defaults.email) {
    updates.email = String(defaults.email).trim().toLowerCase();
    updates.emailLower = updates.email;
  }
  if (!current.fullName && defaults.fullName) updates.fullName = defaults.fullName;
  if (Object.keys(updates).length) {
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
    return { ...current, ...updates };
  }
  return current;
}

export async function toggleSavedEvent(uid, eventId, shouldSave) {
  if (!uid || !eventId) return null;
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    savedEvents: shouldSave ? arrayUnion(eventId) : arrayRemove(eventId),
  });
  return getUserProfile(uid);
}

export async function toggleSavedBusiness(uid, businessId, shouldSave) {
  if (!uid || !businessId) return null;
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, {
    savedBusinesses: shouldSave ? arrayUnion(businessId) : arrayRemove(businessId),
    updatedAt: serverTimestamp(),
  });
  return getUserProfile(uid);
}

export async function updateUserPreferences(uid, changes = {}) {
  if (!uid) return null;
  const allowed = [
    'fullName', 'email', 'defaultCity', 'defaultModule',
    'pushNotificationsEnabled', 'smsNotificationsEnabled', 'emailNotificationsEnabled',
    'eventNotificationsEnabled', 'businessNotificationsEnabled',
    'prayerRemindersEnabled',
    'reminderEmailEnabled', 'adminAlertEmailEnabled', 'privacyAccepted', 'termsAccepted',
  ];
  const payload = Object.fromEntries(
    Object.entries(changes).filter(([key]) => allowed.includes(key))
  );
  if (payload.email) {
    payload.email = String(payload.email).trim().toLowerCase();
    payload.emailLower = payload.email;
  }
  if (!Object.keys(payload).length) return getUserProfile(uid);
  await updateDoc(doc(db, 'users', uid), { ...payload, updatedAt: serverTimestamp() });
  return getUserProfile(uid);
}

function hasPhone(user = {}) {
  return !!String(user.phone || user.phoneNumber || user.mobile || user.mobileNumber || '').trim();
}

function isOldMigratedProfile(user = {}) {
  return !!user.migratedToUid && !(user.isActive !== false && hasPhone(user));
}

export async function listUsers({ includeHidden = false } = {}) {
  const snapshot = await getDocs(collection(db, 'users'));
  const users = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  return includeHidden
    ? users
    : users.filter(user => user.isActive !== false && !isOldMigratedProfile(user));
}

export async function updateUserRole(uid, role) {
  if (!uid) throw new Error('User ID is required.');
  if (![ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role)) {
    throw new Error('Invalid role selected.');
  }

  if (role !== ROLES.SUPER_ADMIN) {
    const snapshot = await getDocs(query(collection(db, 'users'), where('role', '==', ROLES.SUPER_ADMIN)));
    const currentIsSuperAdmin = snapshot.docs.some(item => item.id === uid && item.data().role === ROLES.SUPER_ADMIN);
    if (currentIsSuperAdmin && snapshot.docs.length <= 1) {
      throw new Error('At least one Super Admin must remain in the system.');
    }
  }

  await updateDoc(doc(db, 'users', uid), {
    role,
    updatedAt: serverTimestamp(),
  });
  return getUserProfile(uid);
}

export async function updateUserContactProfile(targetUid, fullName, email, defaultCity) {
  const callable = httpsCallable(functions, 'updateUserContactProfile');
  const payload = {
    targetUid,
    fullName,
    email,
  };
  if (defaultCity) payload.defaultCity = defaultCity;
  const result = await callable(payload);
  return result.data?.profile || null;
}

export async function deleteMyAccountAndEvents(currentUser, archiveEventsNow = false) {
  if (!currentUser || currentUser.isAnonymous) throw new Error('Sign in before deleting your account.');
  const callable = httpsCallable(functions, 'deleteUserData');
  await callable({ archiveEventsNow: Boolean(archiveEventsNow) });
  await deleteUser(currentUser);
}

export async function migratePhoneAccount() {
  try {
    const callable = httpsCallable(functions, 'migratePhoneAccountByPhone');
    const result = await callable({});
    return result.data?.profile || null;
  } catch (error) {
    if (error?.code === 'functions/not-found') return null;
    throw error;
  }
}
