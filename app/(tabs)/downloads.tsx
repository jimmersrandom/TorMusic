import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, SectionList, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { AlbumArt } from '../../components/AlbumArt';
import { BookCover } from '../../components/BookCover';
import { getPlayer } from './_layout';
import {
  getAllDownloadedTracks, deleteDownload, loadDownloads,
  subscribeToDownloadProgress, DownloadRecord, DownloadProgress,
} from '../../services/downloads';
import { AudioTrack, formatFileSize, cleanTorrentName } from '../../services/torbox';
import { useLibrary } from '../../hooks/useLibrary';
import { getStoredApiKey } from '../../services/torbox';

export default function DownloadsScreen() {
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [dlProgress, setDlProgress] = useState<Record<string, DownloadProgress>>({});
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'music' | 'audiobooks'>('music');

  useEffect(() => {
    getStoredApiKey().then(key => {
      setApiKey(key);
      if (key) library.fetchLibrary(key);
    });
  }, []);

  const refresh = useCallback(async () => {
    await loadDownloads();
    setRecords(getAllDownloadedTracks());
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeToDownloadProgress((state) => {
      setDlProgress({ ...state });
      refresh();
    });
    return unsub;
  }, []);

  const player = getPlayer();
  const allTracks = library.tracks;

  const handlePlay = (track: AudioTrack, queue: AudioTrack[]) => {
    const lr = records.find(r => r.trackId === track.id);
    const t = lr ? { ...track, streamUrl: lr.localUri } : track;
    const q = queue.map(qt => {
      const qr = records.find(r => r.trackId === qt.id);
      return qr ? { ...qt, streamUrl: qr.localUri } : qt;
    });
    player?.play(t, q);
  };

  const handleDelete = (trackId: string, displayName: string) => {
    Alert.alert('Remove Download', `Remove offline copy of "${displayName}"?`, [
      { text: 'Remove', style: 'destructive', onPress: async () => {
        await deleteDownload(trackId);
        refresh();
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Separate music and audiobook records
  const musicTracks = allTracks.filter(t =>
    records.some(r => r.trackId === t.id) && (!t.mediaType || t.mediaType === 'music')
  );
  const audiobookTracks = allTracks.filter(t =>
    records.some(r => r.trackId === t.id) && t.mediaType === 'audiobook'
  );

  // Also include in-progress downloads
  const inProgressTracks = allTracks.filter(t => {
    const p = dlProgress[t.id];
    return p && p.status === 'downloading';
  });

  // Group music by album
  type AlbumGroup = { torrentName: string; tracks: AudioTrack[]; totalSize: number };
  const musicGroups: Record<string, AlbumGroup> = {};
  for (const t of [...musicTracks, ...inProgressTracks.filter(t => !t.mediaType || t.mediaType === 'music')]) {
    if (!musicGroups[t.torrentName]) musicGroups[t.torrentName] = { torrentName: t.torrentName, tracks: [], totalSize: 0 };
    if (!musicGroups[t.torrentName].tracks.find(x => x.id === t.id)) {
      musicGroups[t.torrentName].tracks.push(t);
      musicGroups[t.torrentName].totalSize += t.size;
    }
  }

  // Group audiobooks by torrent
  const audiobookGroups: Record<string, AlbumGroup> = {};
  for (const t of [...audiobookTracks, ...inProgressTracks.filter(t => t.mediaType === 'audiobook')]) {
    if (!audiobookGroups[t.torrentName]) audiobookGroups[t.torrentName] = { torrentName: t.torrentName, tracks: [], totalSize: 0 };
    if (!audiobookGroups[t.torrentName].tracks.find(x => x.id === t.id)) {
      audiobookGroups[t.torrentName].tracks.push(t);
      audiobookGroups[t.torrentName].totalSize += t.size;
    }
  }

  const musicSections = Object.values(musicGroups).sort((a, b) => a.torrentName.localeCompare(b.torrentName));
  const audiobookSections = Object.values(audiobookGroups).sort((a, b) => a.torrentName.localeCompare(b.torrentName));

  const totalSize = records.reduce((s, r) => s + r.size, 0);
  const totalDownloaded = records.length;
  const totalInProgress = Object.values(dlProgress).filter(p => p.status === 'downloading').length;

  const handleDeleteAll = () => {
    Alert.alert('Remove All Downloads', `Remove all ${records.length} downloaded tracks?`, [
      { text: 'Remove All', style: 'destructive', onPress: async () => {
        for (const r of records) await deleteDownload(r.trackId);
        refresh();
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  function ProgressBar({ trackId }: { trackId: string }) {
    const p = dlProgress[trackId];
    if (!p || p.status !== 'downloading') return null;
    const pct = Math.round((p.progress || 0) * 100);
    return (
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
        <Text style={styles.progressPct}>{pct}%</Text>
      </View>
    );
  }

  function renderTrackRow(item: AudioTrack) {
    const isActive = player?.state.currentTrack?.id === item.id;
    const isPlaying = isActive && (player?.state.isPlaying ?? false);
    const isDownloaded = records.some(r => r.trackId === item.id);
    const progress = dlProgress[item.id];
    const isDownloading = progress?.status === 'downloading';

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.trackRow, isActive && styles.trackActive]}
        onPress={() => {
          const queue = allTracks.filter(t => t.torrentName === item.torrentName);
          handlePlay(item, queue);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.trackLeft}>
          {isActive
            ? <Ionicons name={isPlaying ? 'musical-notes' : 'pause'} size={14} color={Colors.accent} />
            : <Ionicons name="musical-note-outline" size={14} color={Colors.textMuted} />
          }
        </View>
        <View style={styles.trackInfo}>
          <Text style={[styles.trackName, isActive && styles.trackNameActive]} numberOfLines={1}>
            {item.displayName}
          </Text>
          <View style={styles.trackMetaRow}>
            <Text style={styles.trackMeta}>{formatFileSize(item.size)}</Text>
            {isDownloading && <Text style={styles.downloadingTag}>DOWNLOADING</Text>}
            {isDownloaded && !isDownloading && <Text style={styles.downloadedTag}>OFFLINE PLAY</Text>}
          </View>
          <ProgressBar trackId={item.id} />
        </View>
        {isDownloaded && (
          <TouchableOpacity
            onPress={() => handleDelete(item.id, item.displayName)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  function renderSectionHeader(group: AlbumGroup, isAudiobook = false) {
    const { artist, album, clean } = cleanTorrentName(group.torrentName);
    const downloaded = group.tracks.filter(t => records.some(r => r.trackId === t.id)).length;
    return (
      <View style={styles.albumHeader}>
        {isAudiobook
          ? <BookCover torrentName={group.torrentName} width={52} borderRadius={6} />
          : <AlbumArt torrentName={group.torrentName} size={52} borderRadius={8} />
        }
        <View style={styles.albumHeaderInfo}>
          <Text style={styles.albumHeaderName} numberOfLines={1}>{album || clean}</Text>
          {artist ? <Text style={styles.albumHeaderArtist} numberOfLines={1}>{artist}</Text> : null}
          <Text style={styles.albumHeaderMeta}>
            {downloaded}/{group.tracks.length} tracks · {formatFileSize(group.totalSize)}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.playBtn}
          onPress={() => handlePlay(group.tracks[0], group.tracks)}
        >
          <Ionicons name="play" size={14} color={Colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.albumDeleteBtn}
          onPress={() => {
            Alert.alert('Remove', `Remove all downloaded tracks from "${album || clean}"?`, [
              { text: 'Remove', style: 'destructive', onPress: async () => {
                for (const t of group.tracks) {
                  if (records.some(r => r.trackId === t.id)) await deleteDownload(t.id);
                }
                refresh();
              }},
              { text: 'Cancel', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  const isEmpty = totalDownloaded === 0 && totalInProgress === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Downloads</Text>
        {totalDownloaded > 0 && (
          <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn}>
            <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {totalDownloaded > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            {totalDownloaded} tracks · {formatFileSize(totalSize)} used
            {totalInProgress > 0 ? ` · ${totalInProgress} downloading` : ''}
          </Text>
        </View>
      )}

      {/* Segment */}
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, activeSection === 'music' && styles.segBtnActive]}
          onPress={() => setActiveSection('music')}
        >
          <Ionicons name="musical-notes-outline" size={14} color={activeSection === 'music' ? Colors.white : Colors.textMuted} />
          <Text style={[styles.segText, activeSection === 'music' && styles.segTextActive]}>
            Music ({musicSections.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, activeSection === 'audiobooks' && styles.segBtnActive]}
          onPress={() => setActiveSection('audiobooks')}
        >
          <Ionicons name="headset-outline" size={14} color={activeSection === 'audiobooks' ? Colors.white : Colors.textMuted} />
          <Text style={[styles.segText, activeSection === 'audiobooks' && styles.segTextActive]}>
            Audiobooks ({audiobookSections.length})
          </Text>
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <View style={styles.empty}>
            <Ionicons name="arrow-down-circle-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No downloads yet</Text>
            <Text style={styles.emptyText}>
              Download tracks or audiobooks to listen offline
            </Text>
          </View>
        </ScrollView>
      ) : activeSection === 'music' ? (
        musicSections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No music downloaded</Text>
          </View>
        ) : (
          <SectionList
            sections={musicSections.map(g => ({ ...g, data: g.tracks }))}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderSectionHeader={({ section }) => renderSectionHeader(section, false)}
            renderItem={({ item }) => renderTrackRow(item)}
          />
        )
      ) : (
        audiobookSections.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No audiobooks downloaded</Text>
          </View>
        ) : (
          <SectionList
            sections={audiobookSections.map(g => ({ ...g, data: g.tracks }))}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderSectionHeader={({ section }) => renderSectionHeader(section, true)}
            renderItem={({ item }) => renderTrackRow(item)}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
  },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  deleteAllBtn: { padding: 8 },
  statsBar: { paddingHorizontal: 16, paddingBottom: 8 },
  statsText: { color: Colors.textMuted, fontSize: 13 },
  segment: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 12,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 10,
  },
  segBtnActive: { backgroundColor: Colors.accent },
  segText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  segTextActive: { color: Colors.white },
  list: { paddingBottom: 120 },
  albumHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8,
  },
  albumHeaderInfo: { flex: 1 },
  albumHeaderName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  albumHeaderArtist: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  albumHeaderMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  playBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
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
  trackMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  trackMeta: { color: Colors.textMuted, fontSize: 11 },
  downloadingTag: { color: Colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  downloadedTag: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },
  progressBarBg: {
    height: 3, backgroundColor: Colors.border,
    borderRadius: 2, marginTop: 4,
    flexDirection: 'row', alignItems: 'center',
  },
  progressBarFill: {
    height: 3, backgroundColor: Colors.accent, borderRadius: 2,
  },
  progressPct: { color: Colors.accent, fontSize: 9, fontWeight: '700', marginLeft: 4 },
  emptyScroll: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
