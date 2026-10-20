import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { doc, getDoc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { db, storage } from '../firebase/firebase';

const SETTINGS_DOC = 'azaanRecording';
const LOCAL_CONFIG_KEY = '@community-connect/azaan-recording-v1';
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const bundledSource = require('../../assets/sounds/azan_mashad.mp3');

function exists(snapshot) {
  return typeof snapshot?.exists === 'function' ? snapshot.exists() : Boolean(snapshot?.exists);
}

function normaliseConfig(data = {}) {
  const audioUrl = String(data.audioUrl || '').trim();
  if (!audioUrl) return null;
  return {
    audioUrl,
    fileName: String(data.fileName || 'Uploaded Azan').trim(),
    mimeType: String(data.mimeType || 'audio/mpeg').trim(),
    storagePath: String(data.storagePath || '').trim(),
    version: String(data.version || data.updatedAtClient || '').trim(),
    updatedAtClient: String(data.updatedAtClient || '').trim(),
    updatedByName: String(data.updatedByName || '').trim(),
  };
}

async function rememberConfig(config) {
  try { await AsyncStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config)); } catch { /* cache is optional */ }
}

async function rememberedConfig() {
  try { return normaliseConfig(JSON.parse(await AsyncStorage.getItem(LOCAL_CONFIG_KEY) || 'null') || {}); } catch { return null; }
}

export async function getAzaanRecordingSettings() {
  try {
    const snapshot = await getDoc(doc(db, 'settings', SETTINGS_DOC));
    const config = exists(snapshot) ? normaliseConfig(snapshot.data() || {}) : null;
    if (config) await rememberConfig(config);
    return config;
  } catch {
    return rememberedConfig();
  }
}

function cachedFileUri(config) {
  const extension = config.mimeType.includes('wav') ? 'wav' : config.mimeType.includes('mp4') || config.mimeType.includes('m4a') ? 'm4a' : 'mp3';
  const version = String(config.version || 'current').replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'current';
  return `${FileSystem.cacheDirectory}community-connect-azaan-${version}.${extension}`;
}

export async function getActiveAzaanRecording() {
  const config = await getAzaanRecordingSettings();
  if (!config?.audioUrl) return { source: bundledSource, key: 'bundled', uploaded: false };

  const uri = cachedFileUri(config);
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !info.size) await FileSystem.downloadAsync(config.audioUrl, uri);
    return { source: { uri }, key: `uploaded-${config.version || config.audioUrl}`, uploaded: true, config };
  } catch {
    return { source: bundledSource, key: 'bundled-fallback', uploaded: false, config };
  }
}

export async function uploadAzaanRecording({ uri, fileName, mimeType, size, userId, userName }) {
  if (!uri || !userId) throw new Error('Select an audio file while signed in as Super Admin.');
  const safeMime = String(mimeType || '').toLowerCase();
  if (!safeMime.startsWith('audio/')) throw new Error('Please select an audio file.');
  if (Number(size || 0) > MAX_AUDIO_BYTES) throw new Error('The Azan recording must be smaller than 20 MB.');

  const extension = safeMime.includes('wav') ? 'wav' : safeMime.includes('mp4') || safeMime.includes('m4a') ? 'm4a' : 'mp3';
  const version = String(Date.now());
  const storagePath = `azaan-recordings/${userId}/azaan-${version}.${extension}`;
  const audioRef = ref(storage, storagePath);
  await putFile(audioRef, uri, { contentType: safeMime });
  const audioUrl = await getDownloadURL(audioRef);
  const updatedAtClient = new Date().toISOString();
  const config = {
    audioUrl,
    fileName: String(fileName || `azaan.${extension}`).slice(0, 180),
    mimeType: safeMime,
    storagePath,
    version,
    updatedAt: serverTimestamp(),
    updatedAtClient,
    updatedBy: userId,
    updatedByName: String(userName || 'Super Admin').slice(0, 120),
  };
  await setDoc(doc(db, 'settings', SETTINGS_DOC), config, { merge: true });
  await rememberConfig(config);
  return normaliseConfig(config);
}

export { MAX_AUDIO_BYTES };
