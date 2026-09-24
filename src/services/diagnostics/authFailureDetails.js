const REASONS = [
  'API_KEY_SERVICE_BLOCKED', 'API_KEY_INVALID', 'API_KEY_IOS_APP_BLOCKED',
  'API_KEY_ANDROID_APP_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED',
  'SERVICE_DISABLED', 'PERMISSION_DENIED', 'INVALID_APP_CREDENTIAL',
  'APP_NOT_AUTHORIZED', 'INVALID_APP_ID', 'INVALID_DEBUG_TOKEN',
  'TOO_MANY_ATTEMPTS_TRY_LATER', 'QUOTA_EXCEEDED', 'BILLING_NOT_ENABLED',
  'CAPTCHA_CHECK_FAILED', 'NETWORK_REQUEST_FAILED',
];
const SERVICES = [
  'firebaseappcheck.googleapis.com', 'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com',
];

// Never persist raw SDK errors, stacks, request bodies or URLs. Native errors
// can contain a phone number, OTP, API key or bearer token inside their message.
function errorText(error, depth = 0, seen = new Set()) {
  if (depth > 4 || error == null) return '';
  if (typeof error === 'string') return error.slice(0, 16000);
  if (typeof error !== 'object' || seen.has(error)) return '';
  seen.add(error);
  const keys = [...new Set(['message', 'code', 'nativeErrorMessage', 'cause', ...Object.keys(error)])];
  return keys.slice(0, 30).map(key => {
    try { return errorText(error[key], depth + 1, seen); } catch { return ''; }
  }).join(' ').slice(0, 32000);
}

export function getAuthFailureDetails(error) {
  const text = errorText(error);
  const code = text.match(/\b(?:auth|appCheck|app-check)\/[a-z][a-z-]{1,70}\b/i)?.[0] || 'unknown';
  const status = text.match(/(?:HTTP status code|HTTP status|statusCode)\s*[:=]\s*([45]\d{2})/i)?.[1];
  return {
    code,
    reasons: REASONS.filter(reason => text.includes(reason)),
    services: SERVICES.filter(service => text.includes(service)),
    ...(status ? { httpStatus: Number(status) } : {}),
  };
}
