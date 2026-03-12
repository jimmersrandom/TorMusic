import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { AlbumArt } from '../../components/AlbumArt';
import { getPlayer } from './_layout';
import {
  getAllDownloadedTracks, deleteDownload, loadDownloads,
  subscribeToDownloadProgress, DownloadRecord,
} from '../../services/downloads';
import { AudioTrack, formatFileSize, cleanTorrentName } from '../../services/torbox';
import { useLibrary } from '../../hooks/useLibrary';
import { getStoredApiKey } from '../../services/torbox';

export default function DownloadsScreen() {
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    getStoredApiKey().then(key => {
      setApiKey(key);
      if (key) library.fetchLibrary(key);
    });
  }, []);

  const refresh = useCallback(async () => {
    await loadDownloads();
    const all = getAllDownloadedTracks();
    setRecords(all);
    setDownloadedIds(new Set(all.map(r => r.trackId)));
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeToDownloadProgress(() => refresh());
    return unsub;
  }, []);

  const allTracks = Object.values(library.albumGroups).flat();

  const handleDelete = (trackId: string, displayName: string) => {
    Alert.alert(
      'Remove Download',
      `Remove offline copy of "${displayName}"?`,
      [
        {
          text: 'Remove', style: 'destructive', onPress: async () => {
            await deleteDownload(trackId);
            refresh();
          }
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Remove All Downloads',
      `Remove all ${records.length} downloaded tracks from this device?`,
      [
        {
          text: 'Remove All', style: 'destructive', onPress: async () => {
            for (const record of records) {
              await deleteDownload(record.trackId);
            }
            refresh();
          }
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const player = getPlayer();

  const handlePlay = (track: AudioTrack, queue: AudioTrack[]) => {
    const localRecord = records.find(r => r.trackId === track.id);
    const t = localRecord ? { ...track, streamUrl: localRecord.localUri } : track;
    const q = queue.map(qt => {
      const lr = records.find(r => r.trackId === qt.id);
      return lr ? { ...qt, streamUrl: lr.localUri } : qt;
    });
    player?.play(t, q);
  };

  // Group downloaded tracks by album
  type AlbumGroup = { torrentName: string; tracks: AudioTrack[]; totalSize: number };
  const albumGroups: Record<string, AlbumGroup> = {};

  for (const record of records) {
    const track = allTracks.find(t => t.id === record.trackId);
    if (!track) continue;
    if (!albumGroups[track.torrentName]) {
      albumGroups[track.torrentName] = { torrentName: track.torrentName, tracks: [], totalSize: 0 };
    }
    albumGroups[track.torrentName].tracks.push(track);
    albumGroups[track.torrentName].totalSize += track.size;
  }

  const sections = Object.values(albumGroups).sort((a, b) =>
    a.torrentName.localeCompare(b.torrentName)
  );

  const totalSize = records.reduce((sum, r) => sum + r.size, 0);

  if (records.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Downloads</Text>
        </View>
        <View style={styles.empty}>
          <Ionicons name="arrow-down-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyText}>
            Download tracks or albums from the Library to listen offline
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn}>
          <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {records.length} tracks · {formatFileSize(totalSize)} used
        </Text>
      </View>

      <SectionList
        sections={sections.map(group => ({
          torrentName: group.torrentName,
          totalSize: group.totalSize,
          data: group.tracks,
        }))}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => {
          const { artist, album, clean } = cleanTorrentName(section.torrentName);
          const allAlbumTracks = section.data;
          return (
            <View style={styles.albumHeader}>
              <AlbumArt torrentName={section.torrentName} size={52} borderRadius={8} />
              <View style={styles.albumHeaderInfo}>
                <Text style={styles.albumHeaderName} numberOfLines={1}>{album || clean}</Text>
                {artist ? <Text style={styles.albumHeaderArtist} numberOfLines={1}>{artist}</Text> : null}
                <Text style={styles.albumHeaderMeta}>
                  {section.data.length} tracks · {formatFileSize(section.totalSize)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.playBtn}
                onPress={() => handlePlay(allAlbumTracks[0], allAlbumTracks)}
              >
                <Ionicons name="play" size={16} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.albumDeleteBtn}
                onPress={() => {
                  Alert.alert(
                    'Remove Album',
                    `Remove all ${section.data.length} downloaded tracks from "${album || clean}"?`,
                    [
                      {
                        text: 'Remove', style: 'destructive', onPress: async () => {
                          for (const t of section.data) await deleteDownload(t.id);
                          refresh();
                        }
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        }}
        renderItem={({ item }) => {
          const isActive = player?.state.currentTrack?.id === item.id;
          const isPlaying = isActive && (player?.state.isPlaying ?? false);
          return (
            <TouchableOpacity
              style={[styles.trackRow, isActive && styles.trackActive]}
              onPress={() => {
                const albumTracks = albumGroups[item.torrentName]?.tracks || [item];
                handlePlay(item, albumTracks);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.trackLeft}>
                {isActive ? (
                  <Ionicons name={isPlaying ? 'musical-notes' : 'pause'} size={14} color={Colors.accent} />
                ) : (
                  <Ionicons name="musical-note-outline" size={14} color={Colors.textMuted} />
                )}
              </View>
              <View style={styles.trackInfo}>
                <Text style={[styles.trackName, isActive && styles.trackNameActive]} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={styles.trackMeta}>{formatFileSize(item.size)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.id, item.displayName)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.trackDeleteBtn}
              >
                <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  deleteAllBtn: { padding: 8 },
  statsBar: {
    paddingHorizontal: 16, paddingBottom: 12,
  },
  statsText: { color: Colors.textMuted, fontSize: 13 },
  list: { paddingBottom: 120 },
  albumHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
    marginTop: 8,
  },
  albumHeaderInfo: { flex: 1 },
  albumHeaderName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  albumHeaderArtist: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  albumHeaderMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  albumDeleteBtn: { padding: 6 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  trackActive: { backgroundColor: Colors.accentMuted },
  trackLeft: { width: 20, alignItems: 'center' },
  trackInfo: { flex: 1 },
  trackName: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  trackNameActive: { color: Colors.accent },
  trackMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  trackDeleteBtn: { padding: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
