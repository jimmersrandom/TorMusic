import AsyncStorage from '@react-native-async-storage/async-storage';

const WEBDAV_BASE = 'https://webdav.torbox.app';

export interface WebDAVCredentials {
  email: string;
  password: string;
}

export async function getWebDAVCredentials(): Promise<WebDAVCredentials | null> {
  const email = await AsyncStorage.getItem('webdav_email');
  const password = await AsyncStorage.getItem('webdav_password');
  if (!email || !password) return null;
  return { email, password };
}

export async function saveWebDAVCredentials(email: string, password: string): Promise<void> {
  await AsyncStorage.setItem('webdav_email', email.trim());
  await AsyncStorage.setItem('webdav_password', password.trim());
}

export async function clearWebDAVCredentials(): Promise<void> {
  await AsyncStorage.removeItem('webdav_email');
  await AsyncStorage.removeItem('webdav_password');
}

function toBase64(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let i = 0; i < str.length; i += 3) {
    const a = str.charCodeAt(i);
    const b = str.charCodeAt(i + 1);
    const c = str.charCodeAt(i + 2);
    output += chars[a >> 2];
    output += chars[((a & 3) << 4) | (b >> 4)];
    output += isNaN(b) ? '=' : chars[((b & 15) << 2) | (c >> 6)];
    output += isNaN(c) ? '=' : chars[c & 63];
  }
  return output;
}

export function getAuthHeader(credentials: WebDAVCredentials): string {
  return `Basic ${toBase64(`${credentials.email}:${credentials.password}`)}`;
}

export async function testWebDAVConnection(credentials: WebDAVCredentials): Promise<boolean> {
  try {
    const response = await fetch(WEBDAV_BASE + '/', {
      method: 'PROPFIND',
      headers: {
        'Authorization': getAuthHeader(credentials),
        'Depth': '0',
        'Content-Type': 'application/xml',
      },
    });
    console.log('WebDAV test status:', response.status);
    return response.status === 207 || response.ok;
  } catch (e) {
    console.log('WebDAV test error:', e);
    return false;
  }
}

const AUDIO_EXTENSIONS = ['.flac', '.mp3', '.aac', '.m4a', '.wav', '.ogg', '.opus', '.alac', '.aiff', '.wma', '.ape'];
const EXCLUDED_EXTENSIONS = ['.ac3', '.eac3', '.dts', '.truehd'];

function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXCLUDED_EXTENSIONS.some(e => lower.endsWith(e))) return false;
  return AUDIO_EXTENSIONS.some(e => lower.endsWith(e));
}

function getExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.[^/.]+$/);
  return match ? match[0] : '';
}

function parseDisplayName(filename: string): string {
  const basename = filename.split('/').pop() || filename;
  return basename
    .replace(/\.[^/.]+$/, '')
    .replace(/^\d+\.?\s*/, '')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseWebDAVXML(xml: string): { href: string; isDir: boolean; size: number }[] {
  const results: { href: string; isDir: boolean; size: number }[] = [];
  const responseRegex = /<[^:]*:?response[^>]*>([\s\S]*?)<\/[^:]*:?response>/gi;
  let match;
  while ((match = responseRegex.exec(xml)) !== null) {
    const block = match[1];
    const hrefMatch = block.match(/<[^:]*:?href[^>]*>([\s\S]*?)<\/[^:]*:?href>/i);
    const href = hrefMatch ? decodeURIComponent(hrefMatch[1].trim()) : '';
    const isDir = /<[^:]*:?collection[^>]*\/?>/i.test(block);
    const sizeMatch = block.match(/<[^:]*:?getcontentlength[^>]*>([\s\S]*?)<\/[^:]*:?getcontentlength>/i);
    const size = sizeMatch ? parseInt(sizeMatch[1].trim()) || 0 : 0;
    if (href) results.push({ href, isDir, size });
  }
  return results;
}

// Group flat files into albums by stripping track name/number from filename
// e.g. "Yungblud - Weird - 01. Cotton Candy.mp3" -> "Yungblud - Weird"
function extractAlbumFromFilename(fileName: string): string {
  const noExt = fileName.replace(/\.[^/.]+$/, '');

  // Try "Artist - Album - TrackNum. TrackName" format
  const parts = noExt.split(/\s*-\s*/);
  if (parts.length >= 3) {
    // Last part is likely track name, second-to-last might be "01. trackname"
    // Check if last part starts with a number
    if (/^\d+/.test(parts[parts.length - 1])) {
      return parts.slice(0, -1).join(' - ').trim();
    }
    // Check if second-to-last starts with a number (track num before title)
    if (parts.length >= 3 && /^\d+/.test(parts[parts.length - 2])) {
      return parts.slice(0, -2).join(' - ').trim();
    }
    // Otherwise drop last segment as track title
    return parts.slice(0, -1).join(' - ').trim();
  }

  // Single or double segment — strip leading track number
  return noExt.replace(/^\d+[.\s-]+/, '').trim() || noExt;
}

export interface WebDAVTrack {
  id: string;
  torrentName: string;
  fileName: string;
  displayName: string;
  extension: string;
  size: number;
  streamUrl: string;
  torrentId: number;
  fileId: number;
  name: string;
  cleanAlbumName: string;
  artist: string;
  album: string;
  year: string;
  addedAt: string;
}

export async function fetchWebDAVLibrary(credentials: WebDAVCredentials): Promise<WebDAVTrack[]> {
  const authHeader = getAuthHeader(credentials);
  const tracks: WebDAVTrack[] = [];
  const encodedEmail = encodeURIComponent(credentials.email);
  const encodedPassword = encodeURIComponent(credentials.password);

  console.log('Fetching WebDAV root...');

  const rootRes = await fetch(WEBDAV_BASE + '/', {
    method: 'PROPFIND',
    headers: {
      'Authorization': authHeader,
      'Depth': '1',
      'Content-Type': 'application/xml',
    },
  });

  if (!rootRes.ok && rootRes.status !== 207) {
    throw new Error(`WebDAV error ${rootRes.status}`);
  }

  const rootXml = await rootRes.text();
  console.log('Root XML length:', rootXml.length);
  const rootItems = parseWebDAVXML(rootXml);
  console.log('Root items:', rootItems.length);

  // Filter out root itself
  const nonRoot = rootItems.filter(i => {
    const clean = i.href.replace(/\/$/, '');
    return clean !== '' && clean !== '/' && !clean.match(/^https?:\/\/[^/]+\/?$/);
  });

  const folders = nonRoot.filter(i => i.isDir);
  const files = nonRoot.filter(i => !i.isDir);
  console.log('Folders:', folders.length, 'Files:', files.length);

  // FLATTENED MODE — all files in root
  if (files.length > 0) {
    console.log('Flattened mode —', files.length, 'files in root');
    console.log('Sample:', files.slice(0, 3).map(f => f.href));

    for (const item of files) {
      const fileName = item.href.split('/').pop() || '';
      const decodedFileName = decodeURIComponent(fileName);
      if (!isAudioFile(decodedFileName)) continue;

      // Build correct stream URL: base + exact href
      const streamUrl = WEBDAV_BASE + item.href;
      const authStreamUrl = streamUrl.replace('https://', `https://${encodedEmail}:${encodedPassword}@`);

      const torrentName = extractAlbumFromFilename(decodedFileName);
      const id = item.href.replace(/[/\s]/g, '_');

      tracks.push({
        id, torrentName,
        fileName: decodedFileName,
        displayName: parseDisplayName(decodedFileName),
        extension: getExtension(decodedFileName),
        size: item.size,
        streamUrl: authStreamUrl,
        torrentId: 0, fileId: 0,
        name: decodedFileName,
        cleanAlbumName: torrentName,
        artist: '', album: '', year: '',
        addedAt: new Date().toISOString(),
      });
    }
  }

  // FOLDER MODE — scan each folder
  if (folders.length > 0 && tracks.length === 0) {
    console.log('Folder mode — scanning', folders.length, 'folders');
    for (const folder of folders) {
      const folderPath = folder.href.startsWith('http') ? folder.href : WEBDAV_BASE + folder.href;
      const torrentName = decodeURIComponent(folder.href.split('/').filter(Boolean).pop() || '');

      try {
        const folderRes = await fetch(folderPath, {
          method: 'PROPFIND',
          headers: { 'Authorization': authHeader, 'Depth': '1', 'Content-Type': 'application/xml' },
        });
        if (!folderRes.ok && folderRes.status !== 207) continue;

        const items = parseWebDAVXML(await folderRes.text());
        for (const item of items) {
          if (item.isDir) continue;
          const fileName = decodeURIComponent(item.href.split('/').pop() || '');
          if (!isAudioFile(fileName)) continue;

          const streamUrl = item.href.startsWith('http') ? item.href : WEBDAV_BASE + item.href;
          const authStreamUrl = streamUrl.replace('https://', `https://${encodedEmail}:${encodedPassword}@`);
          const id = item.href.replace(/[/\s]/g, '_');

          tracks.push({
            id, torrentName, fileName,
            displayName: parseDisplayName(fileName),
            extension: getExtension(fileName),
            size: item.size,
            streamUrl: authStreamUrl,
            torrentId: 0, fileId: 0,
            name: fileName, cleanAlbumName: torrentName,
            artist: '', album: '', year: '',
            addedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.log('Error scanning folder:', torrentName, e);
      }
    }
  }

  console.log('Total WebDAV tracks found:', tracks.length);
  return tracks;
}

export function buildWebDAVAuthUrl(
  credentials: WebDAVCredentials,
  torrentName: string,
  fileName: string
): string {
  const encodedEmail = encodeURIComponent(credentials.email);
  const encodedPassword = encodeURIComponent(credentials.password);
  const encodedFile = encodeURIComponent(fileName.split('/').pop() || fileName);
  return `https://${encodedEmail}:${encodedPassword}@webdav.torbox.app/${encodedFile}`;
}
