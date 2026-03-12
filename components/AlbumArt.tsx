import React, { useEffect, useState } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { fetchAlbumArt, cleanTorrentName } from '../services/torbox';
import { Colors } from '../constants/colors';

const ALBUM_COLORS = [
  ['#1a1a2e', '#e94560'],
  ['#0f3460', '#533483'],
  ['#1b1b2f', '#e43f5a'],
  ['#162447', '#1f4068'],
  ['#1b262c', '#0f3460'],
  ['#2d132c', '#ee4540'],
  ['#1a1a2e', '#16213e'],
  ['#0d0d0d', '#1a1a2e'],
  ['#2c003e', '#f5a623'],
  ['#003049', '#d62828'],
];

function getAlbumColors(name: string): string[] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ALBUM_COLORS[Math.abs(hash) % ALBUM_COLORS.length];
}

function getAlbumInitials(name: string): string {
  return name
    .replace(/[\[\(].*?[\]\)]/g, '')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

interface Props {
  torrentName: string;
  size: number;
  borderRadius?: number;
}

export function AlbumArt({ torrentName, size, borderRadius = 12 }: Props) {
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const { artist, album, clean } = cleanTorrentName(torrentName);
  const [bg, accent] = getAlbumColors(torrentName);
  const initials = getAlbumInitials(clean);

  // FIX: depend on torrentName, not derived artist/album strings
  // artist/album are stable strings that don't change when torrentName changes,
  // causing the effect to never re-run for different albums with the same artist.
  useEffect(() => {
    setArtUrl(null); // reset art when track changes
    if (artist && album) {
      fetchAlbumArt(artist, album).then(url => {
        setArtUrl(url);
      });
    }
  }, [torrentName]); // <-- was [artist, album]

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius, backgroundColor: bg }]}>
      {artUrl ? (
        <Image
          source={{ uri: artUrl }}
          style={[styles.image, { borderRadius }]}
        />
      ) : (
        <>
          <View style={[styles.accent, {
            backgroundColor: accent,
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
          }]} />
          <Text style={[styles.initials, { fontSize: size * 0.28 }]}>{initials}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  accent: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    opacity: 0.4,
  },
  initials: {
    color: Colors.white,
    fontWeight: '800',
    opacity: 0.9,
  },
});
