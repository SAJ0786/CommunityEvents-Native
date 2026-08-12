export const HIJRI_MONTHS = [
  { value: 1, name: 'Muharram' },
  { value: 2, name: 'Safar' },
  { value: 3, name: 'Rabi al-Awwal' },
  { value: 4, name: 'Rabi al-Thani' },
  { value: 5, name: 'Jumada al-Awwal' },
  { value: 6, name: 'Jumada al-Thani' },
  { value: 7, name: 'Rajab' },
  { value: 8, name: "Sha'ban" },
  { value: 9, name: 'Ramadan' },
  { value: 10, name: 'Shawwal' },
  { value: 11, name: "Dhu al-Qi'dah" },
  { value: 12, name: 'Dhu al-Hijjah' },
];

function gregorianToJdn(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y
    + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

function islamicToJdnAstro(year, month, day) {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354
    + Math.floor((3 + 11 * year) / 30) + 1948439;
}

function jdnToIslamicAstro(jdn) {
  const year = Math.floor((30 * (jdn - 1948439) + 10646) / 10631);
  const month = Math.min(12, Math.ceil((jdn - 29 - islamicToJdnAstro(year, 1, 1)) / 29.5) + 1);
  const day = jdn - islamicToJdnAstro(year, month, 1) + 1;
  return { year, month, day };
}

function monthIndex(year, month) {
  return Number(year) * 12 + (Number(month) - 1);
}

function fromMonthIndex(index) {
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 + 1 };
}

function addHijriMonths(year, month, delta) {
  return fromMonthIndex(monthIndex(year, month) + delta);
}

function compareHijri(a, b) {
  return a.year !== b.year ? a.year - b.year
    : a.month !== b.month ? a.month - b.month
      : (a.day || 1) - (b.day || 1);
}

function sortOverrides(overrides) {
  const sorted = [...(overrides || [])]
    .map(item => ({
      hYear: Number(item?.hYear),
      hMonth: Number(item?.hMonth),
      gDate: String(item?.gDate || ''),
    }))
    .filter(item => item.hYear && item.hMonth && item.gDate)
    .sort((a, b) => compareHijri(
      { year: a.hYear, month: a.hMonth },
      { year: b.hYear, month: b.hMonth }
    ));
  const cleaned = [];
  for (const override of sorted) {
    const [year, month, day] = override.gDate.split('-').map(Number);
    if (!year || !month || !day) continue;
    const jdn = gregorianToJdn(year, month, day);
    const previous = cleaned[cleaned.length - 1];
    if (previous) {
      const [previousYear, previousMonth, previousDay] = previous.gDate.split('-').map(Number);
      const monthDifference = monthIndex(override.hYear, override.hMonth)
        - monthIndex(previous.hYear, previous.hMonth);
      const dayDifference = jdn - gregorianToJdn(previousYear, previousMonth, previousDay);
      if (
        monthDifference <= 0
        || dayDifference < Math.max(1, monthDifference) * 29
        || dayDifference > Math.max(1, monthDifference) * 30
      ) continue;
    }
    cleaned.push(override);
  }
  return cleaned;
}

function deltaForMonth(hYear, hMonth, overrides = []) {
  let delta = 0;
  for (const override of sortOverrides(overrides)) {
    const comparison = compareHijri(
      { year: hYear, month: hMonth },
      { year: override.hYear, month: override.hMonth }
    );
    if (comparison >= 0) {
      const [year, month, day] = override.gDate.split('-').map(Number);
      delta = gregorianToJdn(year, month, day)
        - islamicToJdnAstro(override.hYear, override.hMonth, 1);
    }
  }
  return delta;
}

function adjustedIslamicToJdn(hYear, hMonth, hDay, overrides = []) {
  return islamicToJdnAstro(hYear, hMonth, hDay) + deltaForMonth(hYear, hMonth, overrides);
}

function monthStartJdn(hYear, hMonth, overrides = []) {
  return adjustedIslamicToJdn(Number(hYear), Number(hMonth), 1, overrides);
}

export function getHijriMonthLength(hYear, hMonth, overrides = []) {
  const next = addHijriMonths(Number(hYear), Number(hMonth), 1);
  return monthStartJdn(next.year, next.month, overrides)
    - monthStartJdn(Number(hYear), Number(hMonth), overrides);
}

export function adjustedIslamicToGregorian(hYear, hMonth, hDay, overrides = []) {
  const startJdn = monthStartJdn(hYear, hMonth, overrides);
  return jdnToGregorian(startJdn + (Number(hDay) - 1));
}

export function adjustedGregorianToIslamic(gYear, gMonth, gDay, overrides = []) {
  try {
    if (!gYear || !gMonth || !gDay) return { year: 0, month: 0, day: 0 };
    const safeOverrides = sortOverrides(overrides);
    const target = gregorianToJdn(Number(gYear), Number(gMonth), Number(gDay));
    const approximate = jdnToIslamicAstro(target);
    for (let index = -14; index <= 14; index += 1) {
      const candidate = addHijriMonths(approximate.year, approximate.month, index);
      const start = monthStartJdn(candidate.year, candidate.month, safeOverrides);
      const next = addHijriMonths(candidate.year, candidate.month, 1);
      const nextStart = monthStartJdn(next.year, next.month, safeOverrides);
      if (target >= start && target < nextStart) {
        return { year: candidate.year, month: candidate.month, day: target - start + 1 };
      }
    }
    return approximate;
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

export function hijriToGregorian(hDay, hMonth, hYear, overrides = []) {
  try {
    if (!hDay || !hMonth || !hYear) return null;
    const gregorian = adjustedIslamicToGregorian(hYear, hMonth, hDay, overrides);
    if (!gregorian?.year) return null;
    return `${gregorian.year}-${String(gregorian.month).padStart(2, '0')}-${String(gregorian.day).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

export function getHijriDisplay(gregorianDate, overrides = []) {
  try {
    if (!gregorianDate || typeof gregorianDate !== 'string') return '';
    const parts = gregorianDate.split('-').map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return '';
    const hijri = adjustedGregorianToIslamic(parts[0], parts[1], parts[2], overrides);
    if (!hijri?.year || !hijri?.month || !hijri?.day) return '';
    const monthName = HIJRI_MONTHS.find(item => item.value === hijri.month)?.name || '';
    return `${hijri.day} ${monthName} ${hijri.year} AH`;
  } catch {
    return '';
  }
}

export function getHijriParts(gregorianDate, overrides = []) {
  try {
    const value = typeof gregorianDate === 'string'
      ? gregorianDate
      : gregorianDate.toISOString().slice(0, 10);
    const [year, month, day] = value.split('-').map(Number);
    return adjustedGregorianToIslamic(year, month, day, overrides);
  } catch {
    return { year: 0, month: 0, day: 0 };
  }
}

export function getCurrentHijriYear(overrides = []) {
  const today = new Date();
  return adjustedGregorianToIslamic(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
    overrides
  ).year;
}

export function hijriDisplayFromParts(hDay, hMonth, hYear) {
  if (!hDay || !hMonth || !hYear) return '';
  const monthName = HIJRI_MONTHS.find(item => item.value === Number(hMonth))?.name || '';
  return `${hDay} ${monthName} ${hYear} AH`;
}
