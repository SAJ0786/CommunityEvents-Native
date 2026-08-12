const FIREBASE_MESSAGES = {
  'auth/email-already-in-use': 'An account already exists for this email. Try signing in.',
  'auth/invalid-credential': 'The email or password is incorrect.',
  'auth/invalid-app-credential': 'This Android app could not be verified for phone sign-in.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/invalid-phone-number': 'Enter a valid Australian mobile number.',
  'auth/invalid-verification-code': 'The verification code is incorrect. Please try again.',
  'auth/missing-phone-number': 'Enter your Australian mobile number.',
  'auth/missing-password': 'Enter your password.',
  'auth/network-request-failed': 'Network connection failed. Check your internet and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled yet.',
  'auth/requires-recent-login': 'Please sign out and sign in again before making this change.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  'auth/quota-exceeded': 'The SMS limit has been reached. Please try again later.',
  'auth/session-expired': 'The verification code expired. Request a new code.',
  'auth/code-expired': 'The verification code expired. Request a new code.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'firestore/permission-denied': 'You do not have permission to make this change.',
  'permission-denied': 'You do not have permission to make this change.',
  'unavailable': 'The service is temporarily unavailable. Check your connection and try again.',
};

export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.code && FIREBASE_MESSAGES[error.code]) return FIREBASE_MESSAGES[error.code];
  const message = String(error?.message || '').replace(/^Firebase:\s*/i, '').trim();
  if (!message || /^FirebaseError/i.test(message)) return fallback;
  return message;
}
