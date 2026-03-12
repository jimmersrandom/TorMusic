import React, { useEffect, useState, useCallback } from 'react';
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SectionList, ActivityIndicator, Linking, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { AlbumArt } from '../../components/AlbumArt';
import { getPlayer } from './_layout';
import { useLibrary } from '../../hooks/useLibrary';
import { getStoredApiKey, AudioTrack, formatFileSize, cleanTorrentName } from '../../services/torbox';
import { getWebDAVCredentials } from '../../services/webdav';

export default function BooksScreen() {
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'audiobooks' | 'ebooks'>('audiobooks');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getStoredApiKey().then(key => {
      setApiKey(key);
      if (key) library.fetchLibrary(key);
    });
  }, []);

  const onRefresh = async () => {
    if (!apiKey) return;
    setRefreshing(true);
    await library.refresh(apiKey);
    setRefreshing(false);
  };

  const player = getPlayer();

  const allTracks = Object.values(library.albumGroups).flat();
  const audiobooks = allTracks.filter(t => t.mediaType === 'audiobook');
  const ebooks = allTracks.filter(t => t.mediaType === 'ebook');

  // Group audiobooks by torrentName
  const audiobookGroups: Record<string, AudioTrack[]> = {};
  for (const t of audiobooks) {
    if (!audiobookGroups[t.torrentName]) audiobookGroups[t.torrentName] = [];
    audiobookGroups[t.torrentName].push(t);
  }

  // Group ebooks by torrentName
  const ebookGroups: Record<string, AudioTrack[]> = {};
  for (const t of ebooks) {
    if (!ebookGroups[t.torrentName]) ebookGroups[t.torrentName] = [];
    ebookGroups[t.torrentName].push(t);
  }

  const handlePlayAudiobook = (track: AudioTrack, queue: AudioTrack[]) => {
    player?.play(track, queue);
  };

  const handleOpenEbook = async (track: AudioTrack) => {
    try {
      const creds = await getWebDAVCredentials();
      if (!creds) {
        Alert.alert('WebDAV required', 'Set up WebDAV credentials in Settings to open ebooks.');
        return;
      }
      const fileName = track.name.split('/').pop() || track.name;
      const url = `https://${encodeURIComponent(creds.email)}:${encodeURIComponent(creds.password)}@webdav.torbox.app/${encodeURIComponent(fileName)}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open', 'No app found to open this ebook. Try installing Apple Books or a PDF reader.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (library.loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isEmpty = audiobooks.length === 0 && ebooks.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Books</Text>
        <Text style={styles.headerCount}>
          {audiobooks.length} audiobooks · {ebooks.length} ebooks
        </Text>
      </View>

      {/* Segment control */}
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, activeSection === 'audiobooks' && styles.segBtnActive]}
          onPress={() => setActiveSection('audiobooks')}
        >
          <Ionicons name="headset-outline" size={15} color={activeSection === 'audiobooks' ? Colors.white : Colors.textMuted} />
          <Text style={[styles.segText, activeSection === 'audiobooks' && styles.segTextActive]}>
            Audiobooks
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, activeSection === 'ebooks' && styles.segBtnActive]}
          onPress={() => setActiveSection('ebooks')}
        >
          <Ionicons name="book-outline" size={15} color={activeSection === 'ebooks' ? Colors.white : Colors.textMuted} />
          <Text style={[styles.segText, activeSection === 'ebooks' && styles.segTextActive]}>
            Ebooks
          </Text>
        </TouchableOpacity>
      </View>

      {/* Audiobooks */}
      {activeSection === 'audiobooks' && (
        audiobooks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="headset-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Audiobooks</Text>
            <Text style={styles.emptyText}>
              Audiobooks are detected from .m4b files or torrents with "audiobook" in the name
            </Text>
          </View>
        ) : (
          <SectionList
            sections={Object.entries(audiobookGroups).map(([torrentName, tracks]) => ({
              torrentName, data: tracks,
            }))}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderSectionHeader={({ section }) => {
              const { artist, album, clean } = cleanTorrentName(section.torrentName);
              const tracks = section.data;
              const totalSize = tracks.reduce((s, t) => s + t.size, 0);
              return (
                <View style={styles.groupHeader}>
                  <AlbumArt torrentName={section.torrentName} size={56} borderRadius={8} />
                  <View style={styles.groupHeaderInfo}>
                    <Text style={styles.groupHeaderName} numberOfLines={2}>{album || clean}</Text>
                    {artist ? <Text style={styles.groupHeaderArtist} numberOfLines={1}>{artist}</Text> : null}
                    <Text style={styles.groupHeaderMeta}>{tracks.length} parts · {formatFileSize(totalSize)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.playBtn}
                    onPress={() => handlePlayAudiobook(tracks[0], tracks)}
                  >
                    <Ionicons name="play" size={16} color={Colors.white} />
                  </TouchableOpacity>
                </View>
              );
            }}
            renderItem={({ item, index }) => {
              const isActive = player?.state.currentTrack?.id === item.id;
              const isPlaying = isActive && (player?.state.isPlaying ?? false);
              return (
                <TouchableOpacity
                  style={[styles.trackRow, isActive && styles.trackActive]}
                  onPress={() => {
                    const queue = audiobookGroups[item.torrentName] || [item];
                    handlePlayAudiobook(item, queue);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.trackLeft}>
                    {isActive
                      ? <Ionicons name={isPlaying ? 'musical-notes' : 'pause'} size={14} color={Colors.accent} />
                      : <Text style={styles.trackIndex}>{index + 1}</Text>
                    }
                  </View>
                  <View style={styles.trackInfo}>
                    <Text style={[styles.trackName, isActive && styles.trackNameActive]} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                    <Text style={styles.trackMeta}>{formatFileSize(item.size)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            }}
          />
        )
      )}

      {/* Ebooks */}
      {activeSection === 'ebooks' && (
        ebooks.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Ebooks</Text>
            <Text style={styles.emptyText}>
              EPUB files in your Torbox library will appear here
            </Text>
          </View>
        ) : (
          <FlatList
            data={Object.entries(ebookGroups)}
            keyExtractor={([name]) => name}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            renderItem={({ item: [torrentName, tracks] }) => {
              const { artist, album, clean } = cleanTorrentName(torrentName);
              return (
                <View>
                  {tracks.map((track) => (
                    <TouchableOpacity
                      key={track.id}
                      style={styles.ebookRow}
                      onPress={() => handleOpenEbook(track)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.ebookIcon}>
                        <Ionicons name="book" size={28} color={Colors.accent} />
                      </View>
                      <View style={styles.trackInfo}>
                        <Text style={styles.trackName} numberOfLines={2}>
                          {album || clean || track.displayName}
                        </Text>
                        {artist ? <Text style={styles.groupHeaderArtist} numberOfLines={1}>{artist}</Text> : null}
                        <Text style={styles.trackMeta}>
                          EPUB · {formatFileSize(track.size)}
                        </Text>
                      </View>
                      <Ionicons name="open-outline" size={18} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            }}
          />
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  headerCount: { color: Colors.textMuted, fontSize: 13 },
  segment: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 16,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
  },
  segBtnActive: { backgroundColor: Colors.accent },
  segText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  segTextActive: { color: Colors.white },
  list: { paddingBottom: 120 },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 8,
  },
  groupHeaderInfo: { flex: 1 },
  groupHeaderName: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  groupHeaderArtist: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  groupHeaderMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  playBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  trackActive: { backgroundColor: Colors.accentMuted },
  trackLeft: { width: 24, alignItems: 'center' },
  trackIndex: { color: Colors.textMuted, fontSize: 13 },
  trackInfo: { flex: 1 },
  trackName: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  trackNameActive: { color: Colors.accent },
  trackMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  ebookRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  ebookIcon: {
    width: 52, height: 52, borderRadius: 8,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
