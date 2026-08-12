import { doc, getDoc, setDoc } from '@react-native-firebase/firestore';
import { db } from '../firebase/firebase';

const OBSERVANCES_DOC = 'hijriObservances';

export const DEFAULT_HIJRI_OBSERVANCES = [
  { id: 'muharram-start', name: 'Beginning of Muharram', day: 1, month: 1, category: 'Season', notes: 'Start of Ayyam-e-Aza', enabled: true, priority: 20 },
  { id: 'karbala-arrival', name: 'Arrival of Imam Hussain (as) at Karbala', day: 2, month: 1, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 40 },
  { id: 'water-blocked', name: 'Water blocked from Imam Hussain (as) camp', day: 7, month: 1, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 45 },
  { id: 'ashura', name: 'Ashura / Shahadat Imam Hussain (as)', day: 10, month: 1, category: 'Shahadat', notes: '', enabled: true, priority: 5 },
  { id: 'soyam-imam-hussain', name: 'Soyam of Imam Hussain (as)', day: 12, month: 1, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 35 },
  { id: 'shahadat-imam-zainul-abideen', name: 'Shahadat Imam Ali Zainul Abideen (as)', day: 25, month: 1, category: 'Shahadat', notes: '4th Imam', enabled: true, priority: 15 },
  { id: 'wiladat-imam-kazim', name: 'Wiladat Imam Musa al-Kazim (as)', day: 7, month: 2, category: 'Wiladat', notes: '7th Imam', enabled: true, priority: 25 },
  { id: 'shahadat-bibi-sakina', name: 'Shahadat Bibi Sakina (sa)', day: 13, month: 2, category: 'Shahadat', notes: '', enabled: true, priority: 18 },
  { id: 'arbaeen', name: 'Arbaeen', day: 20, month: 2, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 5 },
  { id: 'wafat-prophet', name: 'Wafat Prophet Muhammad (saww)', day: 28, month: 2, category: 'Wafat', notes: '', enabled: true, priority: 5 },
  { id: 'shahadat-imam-hasan', name: 'Shahadat Imam Hasan al-Mujtaba (as)', day: 28, month: 2, category: 'Shahadat', notes: '2nd Imam', enabled: true, priority: 10 },
  { id: 'shahadat-imam-ridha', name: 'Shahadat Imam Ali al-Ridha / Imam Reza (as)', day: 29, month: 2, category: 'Shahadat', notes: '8th Imam', enabled: true, priority: 10 },
  { id: 'shahadat-imam-askari', name: 'Shahadat Imam Hasan al-Askari (as)', day: 8, month: 3, category: 'Shahadat', notes: '11th Imam', enabled: true, priority: 10 },
  { id: 'eid-e-zahra', name: 'Eid-e-Zahra / Beginning of Imamate of Imam Mahdi (ajtf)', day: 9, month: 3, category: 'Eid', notes: '', enabled: true, priority: 30 },
  { id: 'wiladat-prophet', name: 'Wiladat Prophet Muhammad (saww)', day: 17, month: 3, category: 'Wiladat', notes: '', enabled: true, priority: 5 },
  { id: 'wiladat-imam-sadiq', name: "Wiladat Imam Ja'far al-Sadiq (as)", day: 17, month: 3, category: 'Wiladat', notes: '6th Imam', enabled: true, priority: 10 },
  { id: 'wiladat-imam-askari', name: 'Wiladat Imam Hasan al-Askari (as)', day: 8, month: 4, category: 'Wiladat', notes: '11th Imam', enabled: true, priority: 25 },
  { id: 'wiladat-bibi-zainab', name: 'Wiladat Bibi Zainab (sa)', day: 5, month: 5, category: 'Wiladat', notes: '', enabled: true, priority: 30 },
  { id: 'first-fatimiyyah', name: 'First Fatimiyyah', day: 13, month: 5, category: 'Shahadat', notes: '75-day narration', enabled: true, priority: 35 },
  { id: 'shahadat-bibi-fatima', name: 'Shahadat Bibi Fatima Zahra (sa)', day: 3, month: 6, category: 'Shahadat', notes: '95-day narration', enabled: true, priority: 5 },
  { id: 'wafat-umm-ul-baneen', name: 'Wafat Umm ul-Baneen (sa)', day: 13, month: 6, category: 'Wafat', notes: '', enabled: true, priority: 35 },
  { id: 'wiladat-bibi-fatima', name: 'Wiladat Bibi Fatima Zahra (sa)', day: 20, month: 6, category: 'Wiladat', notes: '', enabled: true, priority: 5 },
  { id: 'wiladat-imam-baqir', name: 'Wiladat Imam Muhammad al-Baqir (as)', day: 1, month: 7, category: 'Wiladat', notes: '5th Imam', enabled: true, priority: 15 },
  { id: 'shahadat-imam-hadi', name: 'Shahadat Imam Ali al-Hadi (as)', day: 3, month: 7, category: 'Shahadat', notes: '10th Imam', enabled: true, priority: 10 },
  { id: 'wiladat-imam-jawad', name: 'Wiladat Imam Muhammad al-Jawad (as)', day: 10, month: 7, category: 'Wiladat', notes: '9th Imam', enabled: true, priority: 15 },
  { id: 'wiladat-imam-ali', name: 'Wiladat Imam Ali (as)', day: 13, month: 7, category: 'Wiladat', notes: '1st Imam', enabled: true, priority: 5 },
  { id: 'wafat-bibi-zainab', name: 'Wafat Bibi Zainab (sa)', day: 15, month: 7, category: 'Wafat', notes: '', enabled: true, priority: 30 },
  { id: 'shahadat-imam-kazim', name: 'Shahadat Imam Musa al-Kazim (as)', day: 25, month: 7, category: 'Shahadat', notes: '7th Imam', enabled: true, priority: 10 },
  { id: 'mabath', name: 'Mabath / Besat', day: 27, month: 7, category: 'Amaal', notes: '', enabled: true, priority: 20 },
  { id: 'rawangi-karbala', name: 'Rawangi of Imam Hussain (as) for Karbala', day: 28, month: 7, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 28 },
  { id: 'wiladat-imam-hussain', name: 'Wiladat Imam Hussain (as)', day: 3, month: 8, category: 'Wiladat', notes: '3rd Imam', enabled: true, priority: 5 },
  { id: 'wiladat-hazrat-abbas', name: 'Wiladat Hazrat Abbas (as)', day: 4, month: 8, category: 'Wiladat', notes: '', enabled: true, priority: 20 },
  { id: 'wiladat-imam-zainul-abideen', name: 'Wiladat Imam Ali Zainul Abideen (as)', day: 5, month: 8, category: 'Wiladat', notes: '4th Imam', enabled: true, priority: 15 },
  { id: 'wiladat-ali-akbar', name: 'Wiladat Ali Akbar (as)', day: 11, month: 8, category: 'Wiladat', notes: '', enabled: true, priority: 35 },
  { id: 'wiladat-imam-mahdi', name: 'Wiladat Imam Mahdi (ajtf)', day: 15, month: 8, category: 'Wiladat', notes: '12th Imam', enabled: true, priority: 5 },
  { id: 'ramadan-start', name: 'Beginning of Ramadan', day: 1, month: 9, category: 'Season', notes: 'Subject to moon sighting', enabled: true, priority: 20 },
  { id: 'wafat-bibi-khadija', name: 'Wafat Bibi Khadija (sa)', day: 10, month: 9, category: 'Wafat', notes: '', enabled: true, priority: 25 },
  { id: 'wiladat-imam-hasan', name: 'Wiladat Imam Hasan al-Mujtaba (as)', day: 15, month: 9, category: 'Wiladat', notes: '2nd Imam', enabled: true, priority: 5 },
  { id: 'zarb-imam-ali', name: 'Zarbat Imam Ali (as) / Laylatul Qadr', day: 19, month: 9, category: 'Amaal', notes: '', enabled: true, priority: 5 },
  { id: 'shahadat-imam-ali', name: 'Shahadat Imam Ali (as) / Laylatul Qadr', day: 21, month: 9, category: 'Shahadat', notes: '1st Imam', enabled: true, priority: 5 },
  { id: 'laylatul-qadr-23', name: 'Laylatul Qadr', day: 23, month: 9, category: 'Amaal', notes: '', enabled: true, priority: 5 },
  { id: 'eid-fitr', name: 'Eid al-Fitr', day: 1, month: 10, category: 'Eid', notes: '', enabled: true, priority: 5 },
  { id: 'baqi-demolition', name: 'Demolition of Jannat al-Baqi', day: 8, month: 10, category: 'Ayyam-e-Aza', notes: '', enabled: true, priority: 30 },
  { id: 'shahadat-imam-sadiq', name: "Shahadat Imam Ja'far al-Sadiq (as)", day: 25, month: 10, category: 'Shahadat', notes: '6th Imam', enabled: true, priority: 10 },
  { id: 'wiladat-bibi-masooma', name: 'Wiladat Bibi Masooma (sa)', day: 1, month: 11, category: 'Wiladat', notes: '', enabled: true, priority: 40 },
  { id: 'wiladat-imam-ridha', name: 'Wiladat Imam Ali al-Ridha / Imam Reza (as)', day: 11, month: 11, category: 'Wiladat', notes: '8th Imam', enabled: true, priority: 10 },
  { id: 'dahw-al-ard', name: 'Dahw al-Ard', day: 25, month: 11, category: 'Amaal', notes: '', enabled: true, priority: 35 },
  { id: 'shahadat-imam-jawad', name: 'Shahadat Imam Muhammad al-Jawad (as)', day: 29, month: 11, category: 'Shahadat', notes: '9th Imam', enabled: true, priority: 10 },
  { id: 'shahadat-imam-baqir', name: 'Shahadat Imam Muhammad al-Baqir (as)', day: 7, month: 12, category: 'Shahadat', notes: '5th Imam', enabled: true, priority: 10 },
  { id: 'arafah-muslim-aqeel', name: 'Day of Arafah / Shahadat Muslim ibn Aqeel', day: 9, month: 12, category: 'Amaal', notes: '', enabled: true, priority: 25 },
  { id: 'eid-adha', name: 'Eid al-Adha', day: 10, month: 12, category: 'Eid', notes: '', enabled: true, priority: 5 },
  { id: 'wiladat-imam-hadi', name: 'Wiladat Imam Ali al-Hadi (as)', day: 15, month: 12, category: 'Wiladat', notes: '10th Imam', enabled: true, priority: 15 },
  { id: 'eid-ghadir', name: 'Eid al-Ghadir', day: 18, month: 12, category: 'Eid', notes: '', enabled: true, priority: 5 },
  { id: 'mubahila', name: 'Mubahila', day: 24, month: 12, category: 'Event', notes: '', enabled: true, priority: 20 },
];

export async function getHijriObservances() {
  try {
    const snapshot = await getDoc(doc(db, 'settings', OBSERVANCES_DOC));
    const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists;
    const data = exists ? snapshot.data() || {} : {};
    const saved = Array.isArray(data.observances) ? data.observances : [];
    return saved.length ? saved : DEFAULT_HIJRI_OBSERVANCES;
  } catch {
    return DEFAULT_HIJRI_OBSERVANCES;
  }
}

export async function saveHijriObservances(observances) {
  await setDoc(doc(db, 'settings', OBSERVANCES_DOC), {
    observances,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return observances;
}

export function sortHijriObservances(observances = []) {
  return [...observances].sort((a, b) =>
    Number(a.month) - Number(b.month)
    || Number(a.day) - Number(b.day)
    || Number(a.priority || 50) - Number(b.priority || 50)
    || String(a.name || '').localeCompare(String(b.name || ''))
  );
}
