import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { cleanTorrentName } from '../services/torbox';
import { fetchBookCover } from '../services/audiobooks';

interface Props {
  torrentName: string;
  width: number;
  borderRadius?: number;
}

export function BookCover({ torrentName, width, borderRadius = 8 }: Props) {
  const height = Math.round(width * 1.5);
  const [artUrl, setArtUrl] = useState<string | null>(null);

  useEffect(() => {
    setArtUrl(null);
    const { artist, album, clean } = cleanTorrentName(torrentName);

    // If album looks like format junk and artist looks like a real title, swap them
    const junkPattern = /full.cast|unabridged|stereo|split.chapters|edition|audiobook/i;
    const artistIsTitle = !!(artist && junkPattern.test(album) && !junkPattern.test(artist));

    let rawTitle = artistIsTitle ? artist : (album || clean);
    let extractedAuthor: string | undefined = undefined;

    // Try "Title by Author" pattern in full torrent name
    const byMatch = torrentName.match(/^(.+?)\s+by\s+([A-Z][a-zA-Z .]{3,40}?)(?:\s+(?:Full.Cast|Unabridged|Audiobook|M4B|MP3|Stereo|\d{4}|\[|\())/i);
    if (byMatch) {
      rawTitle = byMatch[1].trim();
      extractedAuthor = byMatch[2].trim();
    }

    const title = rawTitle
      .replace(/\bM4B\b/gi, '').replace(/\bMP3\b/gi, '').replace(/\bAudiobook\b/gi, '')
      .replace(/Full.Cast Edition.*/i, '').replace(/Unabridged.*/i, '').replace(/Stereo.*/i, '')
      .replace(/split chapters.*/i, '').replace(/\s+/g, ' ').trim();

    const author = extractedAuthor;
    console.log('[BookCover] title:', title, 'author:', author);

    if (title) {
      fetchBookCover(title, author, torrentName).then(url => {
        console.log('[BookCover] result:', title, '->', url);
        setArtUrl(url);
      });
    }
  }, [torrentName]);

  if (artUrl) {
    return (
      <Image
        source={{ uri: artUrl }}
        style={{ width, height, borderRadius }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View style={[styles.placeholder, { width, height, borderRadius }]}>
      <View style={styles.spine} />
      <Ionicons name="book" size={width * 0.35} color={Colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  spine: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 6,
    backgroundColor: Colors.accent,
    opacity: 0.6,
  },
});
