import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import RNShare from 'react-native-share';
import { responseName, responseAnswer } from '../registration/responsePresentation';

export function registrationWorkbook(title, rows) {
  // Include historical form versions; stable field IDs prevent duplicate labels losing answers.
  const fields = [...new Map(rows.flatMap(row => row.fields || []).map(field => [field.id, field])).values()];
  const data = [['Participant', 'Status', 'Places', 'Submitted at', ...fields.map(field => field.label)],
    ...rows.map(row => [responseName(row), row.status, row.places, row.submittedAt || '', ...fields.map(field => responseAnswer(row.answers?.[field.id]))])];
  // aoa_to_sheet stores answers as literal strings, never spreadsheet formulas.
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet['!cols'] = data[0].map((_, column) => ({ wch: Math.min(60, data.reduce((width, row) => Math.max(width, String(row[column] ?? '').length), 18)) }));
  sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1:D1' };
  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: `${title} — Registration responses`, Author: 'Community Connect Australia' };
  XLSX.utils.book_append_sheet(workbook, sheet, 'Responses');
  return workbook;
}
export async function exportRegistrationWorkbook(title, rows, valid = () => true) {
  const uri = `${FileSystem.cacheDirectory}Registration-responses-${Date.now()}.xlsx`;
  try {
    const data = XLSX.write(registrationWorkbook(title, rows), { type: 'base64', bookType: 'xlsx' });
    if (!valid()) return;
    await FileSystem.writeAsStringAsync(uri, data, { encoding: FileSystem.EncodingType.Base64 });
    if (valid()) await RNShare.open({ url: uri, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', title: 'Registration responses', failOnCancel: false });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}
