import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioTrack } from './torbox';
import { getWebDAVCredentials } from './webdav';
import { getStoredApiKey } from './torbox';

export type DownloadStatus = 'pending' | 'downloading' | 'done' | 'error';

export interface DownloadRecord {
  trackId: string;
  localUri: string;
  size: number;
  downloadedAt: string;
}

export interface DownloadProgress {
  trackId: string;
  progress: number; // 0-1
  status: DownloadStatus;
  error?: string;
}

const DOWNLOADS_KEY = 'velvt_downloads';

// In-memory state
const downloadedTracks: Record<string, DownloadRecord> = {};
const progressListeners: Set<(state: Record<string, DownloadProgress>) => void> = new Set();
const progressState: Record<string, DownloadProgress> = {};

function notifyListeners() {
  progressListeners.forEach(fn => fn({ ...progressState }));
}

export function subscribeToDownloadProgress(fn: (state: Record<string, DownloadProgress>) => void) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export async function loadDownloads() {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADS_KEY);
    if (raw) {
      const data: Record<string, DownloadRecord> = JSON.parse(raw);
      // Verify files still exist
      for (const [id, record] of Object.entries(data)) {
        const info = await FileSystem.getInfoAsync(record.localUri);
        if (info.exists) {
          downloadedTracks[id] = record;
        }
      }
      await saveDownloads();
    }
  } catch {}
}

async function saveDownloads() {
  try {
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloadedTracks));
  } catch {}
}

export function getDownloadedTrack(trackId: string): DownloadRecord | null {
  return downloadedTracks[trackId] || null;
}

export function isTrackDownloaded(trackId: string): boolean {
  return trackId in downloadedTracks;
}

export function getLocalUri(trackId: string): string | null {
  return downloadedTracks[trackId]?.localUri || null;
}

export function getAllDownloadedTracks(): DownloadRecord[] {
  return Object.values(downloadedTracks);
}

export async function deleteDownload(trackId: string): Promise<void> {
  const record = downloadedTracks[trackId];
  if (record) {
    try { await FileSystem.deleteAsync(record.localUri, { idempotent: true }); } catch {}
    delete downloadedTracks[trackId];
    delete progressState[trackId];
    await saveDownloads();
    notifyListeners();
  }
}

function getLocalPath(track: AudioTrack): string {
  const ext = track.extension || '.mp3';
  const safe = track.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${FileSystem.documentDirectory}velvt_offline/${safe}${ext}`;
}

async function ensureDir() {
  const dir = `${FileSystem.documentDirectory}velvt_offline/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

async function getStreamUrlForTrack(track: AudioTrack): Promise<string> {
  // Prefer WebDAV
  const creds = await getWebDAVCredentials();
  if (creds) {
    const fileName = track.name.split('/').pop() || track.name;
    return `https://${encodeURIComponent(creds.email)}:${encodeURIComponent(creds.password)}@webdav.torbox.app/${encodeURIComponent(fileName)}`;
  }
  // Fallback to Torbox API
  const apiKey = await getStoredApiKey();
  if (!apiKey) throw new Error('No API key');
  const { getStreamUrl } = await import('./torbox');
  return getStreamUrl(apiKey, track.torrentId, track.fileId);
}

export async function downloadTrack(track: AudioTrack): Promise<void> {
  if (isTrackDownloaded(track.id)) return;
  if (progressState[track.id]?.status === 'downloading') return;

  progressState[track.id] = { trackId: track.id, progress: 0, status: 'downloading' };
  notifyListeners();

  try {
    await ensureDir();
    const localUri = getLocalPath(track);

    // Remove any partial file
    const existing = await FileSystem.getInfoAsync(localUri);
    if (existing.exists) await FileSystem.deleteAsync(localUri, { idempotent: true });

    const url = await getStreamUrlForTrack(track);

    const download = FileSystem.createDownloadResumable(
      url,
      localUri,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite
          : 0;
        progressState[track.id] = { trackId: track.id, progress, status: 'downloading' };
        notifyListeners();
      }
    );

    const result = await download.downloadAsync();
    if (!result?.uri) throw new Error('Download failed');

    downloadedTracks[track.id] = {
      trackId: track.id,
      localUri: result.uri,
      size: track.size,
      downloadedAt: new Date().toISOString(),
    };
    progressState[track.id] = { trackId: track.id, progress: 1, status: 'done' };
    await saveDownloads();
    notifyListeners();

  } catch (e: any) {
    progressState[track.id] = { trackId: track.id, progress: 0, status: 'error', error: e.message };
    notifyListeners();
    console.log('[download] error for', track.displayName, ':', e.message);
  }
}

export async function downloadAlbum(tracks: AudioTrack[]): Promise<void> {
  // Download sequentially to avoid hammering the server
  for (const track of tracks) {
    if (!isTrackDownloaded(track.id)) {
      await downloadTrack(track);
    }
  }
}

export function getDownloadProgress(trackId: string): DownloadProgress | null {
  return progressState[trackId] || null;
}
