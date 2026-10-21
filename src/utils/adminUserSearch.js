export function normalisePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0061')) digits = digits.slice(2);
  if (digits.startsWith('61') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  return digits;
}

const searchText = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function transferMemberName(user) {
  return user.fullName || user.displayName || user.name || transferMemberContact(user) || 'Member';
}

export function transferMemberContact(user) {
  return user.phone || user.phoneNumber || user.mobile || user.mobileNumber || user.email || '';
}

export function transferMemberCandidates(users, queryText, ownerUid) {
  if (searchText(queryText).length < 2) return [];
  return users.filter(user => user.id !== ownerUid && user.isActive !== false && !user.migratedToUid &&
    !user.bannedAt && !user.archivedAt && !user.accountDeletedAt &&
    !['inactive', 'banned', 'deleted', 'archived', 'suspended'].includes(user.accountStatus))
    .filter(user => userMatchesSearch(user, queryText)).slice(0, 8);
}

export function userMatchesSearch(userRecord, queryText) {
  const textQuery = searchText(queryText);
  if (!textQuery) return true;

  const textFields = [
    userRecord.fullName,
    userRecord.displayName,
    userRecord.name,
    userRecord.email,
  ];
  if (textFields.some(value => searchText(value).includes(textQuery))) return true;

  const phoneQuery = normalisePhone(textQuery);
  if (!phoneQuery) return false;
  return [userRecord.phone, userRecord.phoneNumber, userRecord.mobile, userRecord.mobileNumber]
    .some(value => normalisePhone(value).includes(phoneQuery));
}
