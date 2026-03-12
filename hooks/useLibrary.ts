import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAudioTracks,
  AudioTrack,
  groupByAlbum,
  sortByRecent,
  cleanTorrentName,
  loadMetadataOverrides,
  getMetadataOverride,
  loadArtCache,
  loadArtistImageCache,
  clearArtCacheNulls,
} from '../services/torbox';
import { getWebDAVCredentials } from '../services/webdav';

export type ViewMode = 'recent' | 'albums';
const CACHE_KEY = 'velvt_tracks_cache';
const CACHE_TTL = 5 * 60 * 1000;

export function useLibrary() {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('recent');

  const loadFromCache = async (): Promise<AudioTrack[] | null> => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const { data, timestamp } = JSON.parse(raw);
      if (Date.now() - timestamp > CACHE_TTL) return null;
      return data;
    } catch { return null; }
  };

  const saveToCache = async (data: AudioTrack[]) => {
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}
  };

  const clearCache = async () => {
    await AsyncStorage.removeItem(CACHE_KEY);
  };

  const fetchLibrary = useCallback(async (apiKey: string | null, forceRefresh = false) => {
    await clearArtCacheNulls();
    await loadArtCache();
    await loadArtistImageCache();
    const { loadDownloads } = await import('../services/downloads');
    await loadDownloads();
    await loadMetadataOverrides();
    forceRefresh = true; // Always rebuild from API to apply overrides
    setLoading(true);
    setError(null);
    try {
      if (!forceRefresh) {
        const cached = await loadFromCache();
        if (cached && cached.length > 0) {
          const withOverrides = cached.map(t => {
            const override = getMetadataOverride(t.torrentName);
            if (!override) return t;
            return { ...t, artist: override.artist || t.artist, album: override.album || t.album, year: override.year || t.year };
          });
          setTracks(withOverrides);
          setLoading(false);
          return withOverrides;
        }
      }

      if (!apiKey) {
        throw new Error('API key required to browse library. Add it in Settings.');
      }

      console.log('Fetching library via Torbox API...');
      const data = await fetchAudioTracks(apiKey);

      // If WebDAV is configured, mark tracks to use WebDAV streaming
      const webdavCreds = await getWebDAVCredentials();
      const enriched = data.map(t => {
        const override = getMetadataOverride(t.torrentName);
        if (t.torrentName.toLowerCase().includes('yungblud') || t.torrentName.toLowerCase().includes('yung')) {
        }
        const { artist: rawArtist, album: rawAlbum, year: rawYear, clean } = cleanTorrentName(t.torrentName);
        const artist = override?.artist || rawArtist;
        const album = override?.album || rawAlbum;
        const year = override?.year || rawYear;
        if (webdavCreds) {
          const encodedEmail = encodeURIComponent(webdavCreds.email);
          const encodedPassword = encodeURIComponent(webdavCreds.password);
          // Full path: /TorrentFolder/filename.mp3
          const pathParts = t.name.split('/').map(p => encodeURIComponent(p));
          const encodedPath = pathParts.join('/');
          const streamUrl = `https://${encodedEmail}:${encodedPassword}@webdav.torbox.app/${encodedPath}`;
          return { ...t, artist, album, year, cleanAlbumName: clean, streamUrl };
        }
        return { ...t, artist, album, year, cleanAlbumName: clean };
      });

      setTracks(enriched);
      setLastFetched(Date.now());
      await saveToCache(enriched);
      return enriched;
    } catch (err: any) {
      console.log('Library fetch error:', err.message);
      setError(err.message || 'Failed to load library');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async (apiKey: string | null) => {
    await clearCache();
    return fetchLibrary(apiKey, true);
  }, [fetchLibrary]);

  const recentTracks = sortByRecent(tracks.filter(t => !t.mediaType || t.mediaType === 'music')).slice(0, 50);
  const albumGroups = groupByAlbum(tracks.filter(t => !t.mediaType || t.mediaType === 'music'));

  return {
    tracks, recentTracks, albumGroups,
    loading, error, lastFetched,
    viewMode, setViewMode,
    fetchLibrary, refresh,
  };
}
