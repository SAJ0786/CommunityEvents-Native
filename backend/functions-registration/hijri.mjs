// Forward conversion matches src/services/hijri.js, including trusted month anchors.
function gregorianJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}
function islamicJdn(year, month, day) {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + 1948439;
}
function sortedOverrides(overrides) {
  const result = [];
  for (const item of [...overrides].map(value => ({ hYear: Number(value?.hYear), hMonth: Number(value?.hMonth), gDate: String(value?.gDate || '') }))
    .filter(value => value.hYear && value.hMonth && value.gDate).sort((a, b) => a.hYear - b.hYear || a.hMonth - b.hMonth)) {
    const [year, month, day] = item.gDate.split('-').map(Number);
    if (!year || !month || !day) continue;
    const previous = result.at(-1);
    if (previous) {
      const deltaMonths = (item.hYear - previous.hYear) * 12 + item.hMonth - previous.hMonth;
      const prior = previous.gDate.split('-').map(Number);
      const deltaDays = gregorianJdn(year, month, day) - gregorianJdn(...prior);
      if (deltaMonths <= 0 || deltaDays < deltaMonths * 29 || deltaDays > deltaMonths * 30) continue;
    }
    result.push(item);
  }
  return result;
}
export function hijriToGregorian(day, month, year, overrides = []) {
  let delta = 0;
  for (const item of sortedOverrides(overrides)) {
    if (year > item.hYear || (year === item.hYear && month >= item.hMonth)) {
      delta = gregorianJdn(...item.gDate.split('-').map(Number)) - islamicJdn(item.hYear, item.hMonth, 1);
    }
  }
  const jdn = islamicJdn(year, month, 1) + delta + day - 1;
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor(146097 * b / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor(1461 * d / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return `${100 * b + d - 4800 + Math.floor(m / 10)}-${String(m + 3 - 12 * Math.floor(m / 10)).padStart(2, '0')}-${String(e - Math.floor((153 * m + 2) / 5) + 1).padStart(2, '0')}`;
}
