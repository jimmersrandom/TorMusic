import AsyncStorage from '@react-native-async-storage/async-storage';

const TORBOX_BASE_URL = 'https://api.torbox.app/v1/api';

const AUDIO_EXTENSIONS = [
  '.flac', '.mp3', '.aac', '.m4a', '.wav', '.ogg', '.opus',
  '.alac', '.aiff', '.wma', '.ape', '.dsf', '.dsd'
];

const EXCLUDED_EXTENSIONS = ['.ac3', '.eac3', '.dts', '.truehd'];

export interface TorboxFile {
  id: number;
  name: string;
  size: number;
  mimetype: string;
  short_name: string;
}

export interface TorboxTorrent {
  id: number;
  name: string;
  size: number;
  created_at: string;
  updated_at: string;
  progress: number;
  download_state: string;
  files: TorboxFile[];
}

export interface AudioTrack {
  id: string;
  torrentId: number;
  fileId: number;
  name: string;
  displayName: string;
  size: number;
  extension: string;
  torrentName: string;
  cleanAlbumName: string;
  artist: string;
  album: string;
  year: string;
  addedAt: string;
  streamUrl?: string;
}

function isAudioFile(filename: string, mimetype?: string): boolean {
  const lower = filename.toLowerCase();
  if (EXCLUDED_EXTENSIONS.some(ext => lower.endsWith(ext))) return false;
  if (AUDIO_EXTENSIONS.some(ext => lower.endsWith(ext))) return true;
  if (mimetype && mimetype.startsWith('audio/')) return true;
  return false;
}

export function cleanTorrentName(raw: string): { artist: string; album: string; year: string; clean: string } {
  let name = raw;

  name = name.replace(/&ndash;/g, '-').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  name = name.replace(/\[\s*[A-Za-z0-9]+\.[A-Za-z]{2,4}\s*\]/g, '');
  name = name.replace(/\[\s*UIndex\.org\s*\]/gi, '');
  name = name.replace(/\[(?:FLAC|MP3|AAC|WAV|OGG|OPUS|ALAC)[^\]]*\]/gi, '');
  name = name.replace(/\bMp3\s*\d+kbps\b/gi, '');
  name = name.replace(/\b\d+_?kbps\b/gi, '');
  name = name.replace(/\bFlac\s*[\d\-]+\b/gi, '');
  name = name.replace(/\s+\d{2,3}\s*$/g, '');
  name = name.replace(/\[[^\]]{1,10}\]/g, '');
  name = name.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
  name = name.replace(/⭐/g, '');
  name = name.replace(/\(\d{4}\s+[A-Za-z]+\)/g, (match) => {
    const yearOnly = match.match(/\((\d{4})\)/);
    return yearOnly ? yearOnly[0] : match.replace(/\s+[A-Za-z]+\)/, ')');
  });
  name = name.replace(/\s+/g, ' ').trim();

  const yearMatch = name.match(/\((\d{4})[^)]*\)/);
  const year = yearMatch ? yearMatch[1] : '';
  name = name.replace(/\(\d{4}[^)]*\)/g, '').trim();

  let artist = '';
  let album = name;

  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 0) {
    artist = name.slice(0, dashIdx).trim();
    album = name.slice(dashIdx + 3).trim();
  }

  album = album.replace(/\s+/g, ' ').trim();
  artist = artist.replace(/\s+/g, ' ').trim();

  const clean = artist ? `${artist} - ${album}` : album;

  return { artist, album, year, clean };
}

function parseDisplayName(filename: string): string {
  const parts = filename.split('/');
  const basename = parts[parts.length - 1];
  return basename
    .replace(/\.[^/.]+$/, '')
    .replace(/^\d+\.?\s*/, '')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^/.]+$/);
  return match ? match[0] : '';
}

export async function getStoredApiKey(): Promise<string | null> {
  return AsyncStorage.getItem('torbox_api_key');
}

export async function storeApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem('torbox_api_key', key.trim());
}

export async function clearApiKey(): Promise<void> {
  await AsyncStorage.removeItem('torbox_api_key');
}

async function fetchWithAuth(endpoint: string, apiKey: string): Promise<any> {
  const response = await fetch(`${TORBOX_BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Torbox API error ${response.status}: ${text}`);
  }
  return response.json();
}

export async function fetchTorrents(apiKey: string): Promise<TorboxTorrent[]> {
  const data = await fetchWithAuth('/torrents/mylist?bypass_cache=true', apiKey);
  return data.data || [];
}

export async function fetchAudioTracks(apiKey: string): Promise<AudioTrack[]> {
  const torrents = await fetchTorrents(apiKey);
  const tracks: AudioTrack[] = [];

  for (const torrent of torrents) {
    if (!torrent.files || !Array.isArray(torrent.files)) continue;
    const { artist, album, year, clean } = cleanTorrentName(torrent.name);
    for (const file of torrent.files) {
      if (!file || !file.name) continue;
      if (isAudioFile(file.name, file.mimetype)) {
        tracks.push({
          id: `${torrent.id}-${file.id}`,
          torrentId: torrent.id,
          fileId: file.id,
          name: file.name,
          displayName: parseDisplayName(file.name),
          size: file.size || 0,
          extension: getExtension(file.name),
          torrentName: torrent.name,
          cleanAlbumName: clean,
          artist,
          album,
          year,
          addedAt: torrent.created_at,
        });
      }
    }
  }

  return tracks;
}

export async function getStreamUrl(apiKey: string, torrentId: number, fileId: number): Promise<string> {
  const response = await fetch(
    `${TORBOX_BASE_URL}/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&file_id=${fileId}&zip_link=false`,
    { headers: { 'Authorization': `Bearer ${apiKey}` } }
  );
  if (!response.ok) throw new Error(`Failed to get stream URL: ${response.status}`);
  const data = await response.json();
  if (typeof data.data === 'string') return data.data;
  if (data.data?.url) return data.data.url;
  throw new Error('No stream URL returned from Torbox');
}

// ─── Art Cache ────────────────────────────────────────────────────────────────

const artCache: Record<string, string | null> = {};
const ART_CACHE_KEY = 'velvt_art_cache';

export async function loadArtCache() {
  try {
    // FIX: wipe in-memory cache first to prevent ghost nulls from a previous
    // session surviving across loadArtCache calls (e.g. on hot reload).
    Object.keys(artCache).forEach(k => delete artCache[k]);

    const raw = await AsyncStorage.getItem(ART_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (data[key] !== null) {
          artCache[key.toLowerCase()] = data[key];
        }
      }
    }
  } catch {}
}

export async function clearArtCacheNulls() {
  try {
    const raw = await AsyncStorage.getItem(ART_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const cleaned: Record<string, string> = {};
      for (const key of Object.keys(data)) {
        if (data[key] !== null) cleaned[key] = data[key];
      }
      await AsyncStorage.setItem(ART_CACHE_KEY, JSON.stringify(cleaned));
    }
  } catch {}
}

async function saveArtCache() {
  try {
    await AsyncStorage.setItem(ART_CACHE_KEY, JSON.stringify(artCache));
  } catch {}
}

// ─── Metadata Overrides ───────────────────────────────────────────────────────

const metadataOverrides: Record<string, { artist?: string; album?: string; year?: string }> = {};
const OVERRIDES_KEY = 'velvt_metadata_overrides';

export async function loadMetadataOverrides() {
  try {
    const raw = await AsyncStorage.getItem(OVERRIDES_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        metadataOverrides[key] = data[key];
      }
    }
  } catch (e: any) {
    console.log('loadMetadataOverrides error:', e.message);
  }
}

export function getMetadataOverride(torrentName: string) {
  return metadataOverrides[torrentName] || null;
}

export async function setMetadataOverride(torrentName: string, data: { artist?: string; album?: string; year?: string }) {
  metadataOverrides[torrentName] = data;
  try {
    await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(metadataOverrides));
  } catch {}
}

// ─── MusicBrainz Metadata Fetch ───────────────────────────────────────────────

export async function fetchMetadataFromMusicBrainz(
  artist: string,
  album: string,
  forceRefresh = false
): Promise<{ artist: string; album: string; year: string; artUrl: string | null } | null> {
  const cacheKey = `meta|${artist}|${album}`;
  if (!forceRefresh && metadataOverrides[cacheKey]) return null;

  const cleanStr = (s: string) => s
    .replace(/\(.*?\)/g, '')
    .replace(/[^\w\s\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const ca = cleanStr(artist);
  const cal = cleanStr(album);

  const queries = [
    ca && cal ? `artist:"${ca}" AND release:"${cal}"` : null,
    ca && cal ? `artist:${ca} AND release:${cal}` : null,
    ca ? `artist:"${ca}"` : null,
    cal ? `release:"${cal}"` : null,
  ].filter(Boolean) as string[];

  for (const query of queries) {
    try {
      const res = await fetch(
        `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&limit=5&fmt=json`,
        { headers: { 'User-Agent': 'Velvt/1.0 (velvt@example.com)' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const releases = data.releases || [];
      if (!releases.length) continue;
      const best = releases[0];
      const canonicalArtist = best['artist-credit']?.[0]?.artist?.name || artist;
      const canonicalAlbum = best.title || album;
      const canonicalYear = best.date?.substring(0, 4) || '';
      const releaseId = best.id;

      let artUrl: string | null = null;
      try {
        const artJson = await fetch(`https://coverartarchive.org/release/${releaseId}`);
        if (artJson.ok) {
          const artData = await artJson.json();
          const front = artData.images?.find((img: any) => img.front);
          artUrl = front?.thumbnails?.['250'] || front?.thumbnails?.small || front?.image || null;
        }
      } catch {}

      if (!artUrl) {
        try {
          const directUrl = `https://coverartarchive.org/release/${releaseId}/front-250`;
          const check = await fetch(directUrl, { method: 'HEAD' });
          if (check.ok) artUrl = directUrl;
        } catch {}
      }

      const artCacheKey = `${canonicalArtist.toLowerCase()}|${canonicalAlbum.toLowerCase()}`;
      if (artUrl) {
        artCache[artCacheKey] = artUrl;
        saveArtCache();
      }
      return { artist: canonicalArtist, album: canonicalAlbum, year: canonicalYear, artUrl };
    } catch {}
  }
  return null;
}

// ─── fetchAlbumArt ────────────────────────────────────────────────────────────

export async function fetchAlbumArt(artist: string, album: string): Promise<string | null> {
  // FIX: normalise cache key to lowercase so 'Yungblud|Idols' hits 'yungblud|idols'
  const cacheKey = `${artist}|${album}`.toLowerCase();

  if (cacheKey in artCache) {
    console.log('[fetchAlbumArt] cache hit:', cacheKey, '->', artCache[cacheKey]);
    return artCache[cacheKey];
  }

  console.log('[fetchAlbumArt] cache miss, querying MusicBrainz for:', cacheKey);

  // FIX: use the locally-scoped artist/album params (was referencing undefined
  // cleanArtist/cleanAlbum variables, causing a silent throw → null return)
  const cleanStr = (s: string) => s
    .replace(/\(.*?\)/g, '')
    .replace(/[^\w\s\-']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanArtist = cleanStr(artist);
  const cleanAlbum = cleanStr(album);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const query = encodeURIComponent(`artist:${cleanArtist} AND release:${cleanAlbum}`);
    console.log('[Art] Trying:', query);

    const res = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=${query}&limit=1&fmt=json`,
      {
        headers: { 'User-Agent': 'Velvt/1.0 (velvt@example.com)' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const releases = data.releases || [];
    if (releases.length === 0) return null;

    const releaseId = releases[0].id;

    // Try JSON endpoint first (more reliable)
    try {
      const artJson = await fetch(`https://coverartarchive.org/release/${releaseId}`);
      if (artJson.ok) {
        const artData = await artJson.json();
        const front = artData.images?.find((img: any) => img.front);
        const url = front?.thumbnails?.['250'] || front?.thumbnails?.small || front?.image || null;
        if (url) {
          artCache[cacheKey] = url;
          saveArtCache();
          return url;
        }
      }
    } catch {}

    // Fallback: direct URL HEAD check
    const directUrl = `https://coverartarchive.org/release/${releaseId}/front-250`;
    const check = await fetch(directUrl, { method: 'HEAD' });
    if (check.ok) {
      artCache[cacheKey] = directUrl;
      saveArtCache();
      return directUrl;
    }
  } catch (e: any) {
    clearTimeout(timeout);
    console.log('[fetchAlbumArt] error:', e.message);
  }

  // Don't cache nulls — always retry next time
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function groupByAlbum(tracks: AudioTrack[]): Record<string, AudioTrack[]> {
  const groups: Record<string, AudioTrack[]> = {};
  for (const track of tracks) {
    const key = track.torrentName;
    if (!groups[key]) groups[key] = [];
    groups[key].push(track);
  }
  return groups;
}

export function sortByRecent(tracks: AudioTrack[]): AudioTrack[] {
  return [...tracks].sort((a, b) =>
    new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}


// ─── Artist Image (Wikipedia) ─────────────────────────────────────────────────

const artistImageCache: Record<string, string | null> = {};
const ARTIST_IMAGE_CACHE_KEY = 'velvt_artist_image_cache';

export async function loadArtistImageCache() {
  try {
    Object.keys(artistImageCache).forEach(k => delete artistImageCache[k]);
    const raw = await AsyncStorage.getItem(ARTIST_IMAGE_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (data[key] !== null) artistImageCache[key.toLowerCase()] = data[key];
      }
    }
  } catch {}
}

async function saveArtistImageCache() {
  try {
    await AsyncStorage.setItem(ARTIST_IMAGE_CACHE_KEY, JSON.stringify(artistImageCache));
  } catch {}
}

async function getWikipediaImage(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&pilimit=1&format=json&origin=*`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as any;
    return page?.thumbnail?.source || null;
  } catch {
    return null;
  }
}

export async function fetchArtistImage(artist: string): Promise<string | null> {
  const cacheKey = artist.toLowerCase();
  if (cacheKey in artistImageCache) return artistImageCache[cacheKey];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    // Try multiple search queries in order
    const queries = [
      artist,
      `${artist} band`,
      `${artist} musician`,
      `${artist} singer`,
    ];

    let imageUrl: string | null = null;

    for (const query of queries) {
      if (imageUrl) break;

      // Use Wikipedia's search API to find the best matching page
      const searchRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`,
        { signal: controller.signal }
      );
      if (!searchRes.ok) continue;

      const searchData = await searchRes.json();
      const results: any[] = searchData.query?.search || [];

      for (const result of results) {
        const url = await getWikipediaImage(result.title);
        if (url) {
          imageUrl = url;
          console.log('[fetchArtistImage]', artist, '-> found via:', result.title, url);
          break;
        }
      }
    }

    clearTimeout(timeout);
    artistImageCache[cacheKey] = imageUrl;
    saveArtistImageCache();
    if (!imageUrl) console.log('[fetchArtistImage]', artist, '-> no image found');
    return imageUrl;

  } catch (e: any) {
    clearTimeout(timeout);
    console.log('[fetchArtistImage] error:', e.message);
    return null;
  }
}
