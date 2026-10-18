export function normalisePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0061')) digits = digits.slice(2);
  if (digits.startsWith('61') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  return digits;
}

export function userMatchesSearch(userRecord, queryText) {
  const textQuery = String(queryText || '').trim().toLowerCase();
  if (!textQuery) return true;

  const textFields = [
    userRecord.fullName,
    userRecord.displayName,
    userRecord.name,
    userRecord.email,
  ];
  if (textFields.some(value => String(value || '').toLowerCase().includes(textQuery))) return true;

  const phoneQuery = normalisePhone(textQuery);
  if (!phoneQuery) return false;
  return [userRecord.phone, userRecord.phoneNumber, userRecord.mobile, userRecord.mobileNumber]
    .some(value => normalisePhone(value).includes(phoneQuery));
}
