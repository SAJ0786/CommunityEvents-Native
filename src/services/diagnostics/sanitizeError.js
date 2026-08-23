const SENSITIVE_KEY = /(password|passcode|token|secret|authorization|cookie|credential|private.?key|api.?key)/i;

function redact(value, depth = 0) {
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]));
  }
  if (typeof value === 'string') {
    return value
      .replace(/([?&](?:key|token|secret|auth)=)[^&\s]+/gi, '$1[redacted]')
      .slice(0, 1000);
  }
  return value;
}

export function sanitizeDiagnosticError(error) {
  const source = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack, code: error.code }
    : error;
  return redact(source || { message: 'Unknown error' });
}

export function sanitizeDiagnosticMetadata(metadata = {}) {
  return redact(metadata);
}
