const digitsOnly = value => String(value || '').replace(/\D/g, '');

export function normalizeAustralianWhatsAppNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) {
    const digits = digitsOnly(raw);
    return digits ? `+${digits}` : '';
  }
  const digits = digitsOnly(raw);
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+61${digits.slice(1)}`;
  return digits ? `+${digits}` : '';
}

export function buildWhatsAppUrl(value) {
  const normalized = normalizeAustralianWhatsAppNumber(value);
  return normalized ? `https://wa.me/${normalized.slice(1)}` : '';
}
