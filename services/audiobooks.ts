import AsyncStorage from '@react-native-async-storage/async-storage';

const RESUME_KEY = 'velvt_audiobook_resume';

export interface AudiobookResume {
  torrentName: string;
  trackId: string;
  position: number;
  updatedAt: string;
}

const resumeCache: Record<string, AudiobookResume> = {};

export async function loadResumePositions() {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY);
    if (raw) Object.assign(resumeCache, JSON.parse(raw));
  } catch {}
}

export async function saveResumePosition(torrentName: string, trackId: string, position: number) {
  resumeCache[torrentName] = { torrentName, trackId, position, updatedAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(resumeCache));
  } catch {}
}

export function getResumePosition(torrentName: string): AudiobookResume | null {
  return resumeCache[torrentName] || null;
}

export function parseChapters(tracks: { id: string; displayName: string; size: number }[]) {
  return tracks.map((t, i) => {
    const name = t.displayName
      .replace(/^\d+\s*[-_.]\s*/, '')
      .replace(/\.(mp3|m4a|m4b|aac)$/i, '')
      .trim();
    return {
      index: i,
      trackId: t.id,
      title: name || `Chapter ${i + 1}`,
      size: t.size,
    };
  });
}

// ─── Book Cover Art (Open Library) ───────────────────────────────────────────

const bookCoverCache: Record<string, string | null> = {};
const torrentCoverMap: Record<string, string> = {};
const BOOK_COVER_CACHE_KEY = 'velvt_book_cover_cache';

export async function clearBookCoverCache() {
  try {
    await AsyncStorage.removeItem(BOOK_COVER_CACHE_KEY);
    Object.keys(bookCoverCache).forEach(k => delete bookCoverCache[k]);
  } catch {}
}

export async function loadBookCoverCache() {
  try {
    const raw = await AsyncStorage.getItem(BOOK_COVER_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      for (const key of Object.keys(data)) {
        if (data[key] !== null) bookCoverCache[key.toLowerCase()] = data[key];
      }
    }
  } catch {}
}

async function saveBookCoverCache() {
  try {
    await AsyncStorage.setItem(BOOK_COVER_CACHE_KEY, JSON.stringify(bookCoverCache));
  } catch {}
}

export function getBookCoverFromCache(torrentName: string): string | null {
  return torrentCoverMap[torrentName] || null;
}

export async function fetchBookCover(title: string, author?: string, torrentName?: string): Promise<string | null> {
  const cacheKey = `${title}|${author || ''}`.toLowerCase();
  if (cacheKey in bookCoverCache) return bookCoverCache[cacheKey];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    // Search Open Library by title + author
    const query = author
      ? `${encodeURIComponent(title)}+${encodeURIComponent(author)}`
      : encodeURIComponent(title);

    const res = await fetch(
      `https://openlibrary.org/search.json?q=${query}&limit=5&fields=key,title,author_name,cover_i`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      bookCoverCache[cacheKey] = null;
      return null;
    }

    const data = await res.json();
    const docs = data.docs || [];

    // Find first result with a cover
    for (const doc of docs) {
      if (doc.cover_i) {
        const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        console.log('[fetchBookCover]', title, '->', url);
        bookCoverCache[cacheKey] = url;
        if (torrentName) torrentCoverMap[torrentName] = url;
        await saveBookCoverCache();
        return url;
      }
    }

    bookCoverCache[cacheKey] = null;
    await saveBookCoverCache();
    return null;
  } catch (e: any) {
    clearTimeout(timeout);
    console.log('[fetchBookCover] error:', e.message);
    return null;
  }
}
