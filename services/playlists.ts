import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  coverUri?: string; // base64 data URI or file URI
  createdAt: string;
  updatedAt: string;
}

const PLAYLISTS_KEY = 'velvt_playlists';
let cache: Record<string, Playlist> | null = null;

async function load(): Promise<Record<string, Playlist>> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(PLAYLISTS_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

async function save() {
  try {
    await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(cache));
  } catch {}
}

export async function getPlaylists(): Promise<Playlist[]> {
  const data = await load();
  return Object.values(data).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getPlaylist(id: string): Promise<Playlist | null> {
  const data = await load();
  return data[id] ?? null;
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const data = await load();
  const id = `pl_${Date.now()}`;
  const now = new Date().toISOString();
  const playlist: Playlist = { id, name, trackIds: [], createdAt: now, updatedAt: now };
  data[id] = playlist;
  await save();
  return playlist;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  const data = await load();
  if (!data[id]) return;
  data[id].name = name;
  data[id].updatedAt = new Date().toISOString();
  await save();
}

export async function deletePlaylist(id: string): Promise<void> {
  const data = await load();
  delete data[id];
  await save();
}

export async function addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
  const data = await load();
  if (!data[playlistId]) return;
  if (!data[playlistId].trackIds.includes(trackId)) {
    data[playlistId].trackIds.push(trackId);
    data[playlistId].updatedAt = new Date().toISOString();
    await save();
  }
}

export async function removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const data = await load();
  if (!data[playlistId]) return;
  data[playlistId].trackIds = data[playlistId].trackIds.filter(id => id !== trackId);
  data[playlistId].updatedAt = new Date().toISOString();
  await save();
}

export async function reorderPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
  const data = await load();
  if (!data[playlistId]) return;
  data[playlistId].trackIds = trackIds;
  data[playlistId].updatedAt = new Date().toISOString();
  await save();
}

export async function setPlaylistCover(playlistId: string, coverUri: string): Promise<void> {
  const data = await load();
  if (!data[playlistId]) return;
  data[playlistId].coverUri = coverUri;
  data[playlistId].updatedAt = new Date().toISOString();
  await save();
}

export function invalidateCache() {
  cache = null;
}
