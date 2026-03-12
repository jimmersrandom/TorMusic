import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { Playlist } from '../services/playlists';
import { AlbumArt } from './AlbumArt';
import { AudioTrack } from '../services/torbox';

interface Props {
  playlist: Playlist;
  size: number;
  allTracks: AudioTrack[];
  onPress: () => void;
}

export function PlaylistCard({ playlist, size, allTracks, onPress }: Props) {
  // First 4 tracks for mosaic
  const mosaicTracks = playlist.trackIds
    .slice(0, 4)
    .map(id => allTracks.find(t => t.id === id))
    .filter(Boolean) as AudioTrack[];

  return (
    <TouchableOpacity style={[styles.card, { width: size }]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.artContainer, { width: size, height: size }]}>
        {playlist.coverUri ? (
          // Custom cover
          <Image
            source={{ uri: playlist.coverUri }}
            style={[styles.customCover, { width: size, height: size, borderRadius: 12 }]}
            resizeMode="cover"
          />
        ) : mosaicTracks.length >= 4 ? (
          // 2x2 mosaic
          <View style={[styles.mosaic, { width: size, height: size, borderRadius: 12 }]}>
            {mosaicTracks.map((t, i) => (
              <AlbumArt
                key={i}
                torrentName={t.torrentName}
                size={size / 2 - 1}
                borderRadius={0}
              />
            ))}
          </View>
        ) : mosaicTracks.length > 0 ? (
          // Single art if < 4 tracks
          <AlbumArt
            torrentName={mosaicTracks[0].torrentName}
            size={size}
            borderRadius={12}
          />
        ) : (
          // Empty placeholder
          <View style={[styles.placeholder, { width: size, height: size, borderRadius: 12 }]}>
            <Ionicons name="musical-notes" size={size * 0.35} color={Colors.textMuted} />
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>{playlist.name}</Text>
      <Text style={styles.count}>{playlist.trackIds.length} tracks</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 4 },
  artContainer: { marginBottom: 8, overflow: 'hidden' },
  customCover: {},
  mosaic: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: Colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  count: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
