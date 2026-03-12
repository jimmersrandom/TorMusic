import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LyricLine {
  time: number; // ms
  text: string;
}

export interface LyricsState {
  lines: LyricLine[];
  plain: string | null;
  isSynced: boolean;
  isLoading: boolean;
  error: string | null;
  activeLine: number;
}

const LYRICS_CACHE_KEY = 'velvt_lyrics_cache';
const lyricsCache: Record<string, { lines: LyricLine[]; plain: string | null; isSynced: boolean } | null> = {};

async function loadLyricsCache() {
  try {
    const raw = await AsyncStorage.getItem(LYRICS_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        lyricsCache[key] = data[key];
      }
    }
  } catch {}
}

async function saveLyricsCache() {
  try {
    await AsyncStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(lyricsCache));
  } catch {}
}

loadLyricsCache();

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const raw of lrc.split('\n')) {
    const m = raw.match(lineRe);
    if (!m) continue;
    const mins = parseInt(m[1], 10);
    const secs = parseInt(m[2], 10);
    const ms = m[3].length === 2 ? parseInt(m[3], 10) * 10 : parseInt(m[3], 10);
    const time = mins * 60000 + secs * 1000 + ms;
    const text = m[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function fetchLyricsFromLRCLIB(
  artist: string,
  track: string,
  album: string,
  durationSecs: number
): Promise<{ lines: LyricLine[]; plain: string | null; isSynced: boolean } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: track,
      album_name: album,
    });
    if (durationSecs > 0) params.set('duration', String(Math.round(durationSecs)));

    const res = await fetch(
      `https://lrclib.net/api/get?${params.toString()}`,
      {
        headers: { 'Lrclib-Client': 'Velvt/1.0 (https://github.com/jimmersrandom/TorMusic)' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const data = await res.json();

    if (data.syncedLyrics) {
      const lines = parseLRC(data.syncedLyrics);
      if (lines.length > 0) return { lines, plain: data.plainLyrics || null, isSynced: true };
    }

    if (data.plainLyrics) {
      return { lines: [], plain: data.plainLyrics, isSynced: false };
    }

    return null;
  } catch (e: any) {
    clearTimeout(timeout);
    console.log('[useLyrics] fetch error:', e.message);
    return null;
  }
}

export function useLyrics(
  trackId: string | null,
  artist: string,
  trackName: string,
  album: string,
  durationMs: number,
  positionMs: number,
  isVisible: boolean
) {
  const [state, setState] = useState<LyricsState>({
    lines: [], plain: null, isSynced: false,
    isLoading: false, error: null, activeLine: -1,
  });

  const lastFetchedId = useRef<string | null>(null);

  // Fetch lyrics when track changes and lyrics panel is visible
  useEffect(() => {
    if (!isVisible || !trackId || !artist || !trackName) return;
    if (lastFetchedId.current === trackId) return;
    lastFetchedId.current = trackId;

    // Check in-memory cache first
    if (trackId in lyricsCache) {
      const cached = lyricsCache[trackId];
      if (cached) {
        setState(prev => ({
          ...prev,
          lines: cached.lines,
          plain: cached.plain,
          isSynced: cached.isSynced,
          isLoading: false,
          error: null,
          activeLine: -1,
        }));
      } else {
        setState(prev => ({
          ...prev,
          lines: [], plain: null, isSynced: false,
          isLoading: false, error: 'No lyrics found', activeLine: -1,
        }));
      }
      return;
    }

    setState(prev => ({
      ...prev,
      lines: [], plain: null, isSynced: false,
      isLoading: true, error: null, activeLine: -1,
    }));

    fetchLyricsFromLRCLIB(artist, trackName, album, durationMs / 1000).then(result => {
      lyricsCache[trackId] = result;
      saveLyricsCache();
      if (result) {
        setState(prev => ({
          ...prev,
          lines: result.lines,
          plain: result.plain,
          isSynced: result.isSynced,
          isLoading: false,
          error: null,
          activeLine: -1,
        }));
      } else {
        setState(prev => ({
          ...prev,
          lines: [], plain: null, isSynced: false,
          isLoading: false,
          error: 'No lyrics found',
          activeLine: -1,
        }));
      }
    });
  }, [trackId, isVisible]);

  // Update active line from position
  useEffect(() => {
    if (!state.isSynced || state.lines.length === 0) return;
    let active = -1;
    for (let i = 0; i < state.lines.length; i++) {
      if (positionMs >= state.lines[i].time) active = i;
      else break;
    }
    setState(prev => {
      if (prev.activeLine === active) return prev;
      return { ...prev, activeLine: active };
    });
  }, [positionMs, state.isSynced, state.lines]);

  return state;
}
