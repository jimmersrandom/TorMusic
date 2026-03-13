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
    let rawTitle = album || clean;

    // Extract "by Author" from title if present
    let extractedAuthor = artist || undefined;
    const byMatch = rawTitle.match(/^(.+?)\s+by\s+([A-Z][^(\[]+?)(?:\s+M4B|\s+MP3|\s+Audiobook|\s*$)/i);
    if (byMatch) {
      rawTitle = byMatch[1].trim();
      if (!extractedAuthor) extractedAuthor = byMatch[2].trim();
    }

    // Strip format tags from title
    const title = rawTitle
      .replace(/\bM4B\b/gi, '')
      .replace(/\bMP3\b/gi, '')
      .replace(/\bAudiobook\b/gi, '')
      .replace(/\bUnabridged\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const author = extractedAuthor;
    console.log('[BookCover] title:', title, 'author:', author);
    if (title) {
      fetchBookCover(title, author).then(url => {
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
