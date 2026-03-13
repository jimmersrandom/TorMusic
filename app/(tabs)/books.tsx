import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  FlatList, ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { BookCover } from '../../components/BookCover';
import { getPlayer } from './_layout';
import { useLibrary } from '../../hooks/useLibrary';
import { getStoredApiKey, AudioTrack, formatFileSize, cleanTorrentName } from '../../services/torbox';
import { getLocalUri, downloadAlbum, isTrackDownloaded, subscribeToDownloadProgress, getAllDownloadedTracks } from '../../services/downloads';
import {
  loadResumePositions, saveResumePosition,
  getResumePosition, parseChapters,
} from '../../services/audiobooks';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.5);

interface AudiobookGroup {
  torrentName: string;
  tracks: AudioTrack[];
}

export default function BooksScreen() {
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dlProgress, setDlProgress] = useState<Record<string, any>>({});
  const [selectedBook, setSelectedBook] = useState<AudiobookGroup | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);

  useEffect(() => {
    const unsub = subscribeToDownloadProgress(state => setDlProgress({ ...state }));
    return unsub;
  }, []);

  useEffect(() => {
    getStoredApiKey().then(key => {
      setApiKey(key);
      if (key) library.fetchLibrary(key);
    });
    loadResumePositions().then(() => setResumeLoaded(true));
  }, []);

  // Save resume position as player progresses
  const player = getPlayer();
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekingRef = useRef(false);
  const resumingRef = useRef(false);

  useEffect(() => {
    saveIntervalRef.current = setInterval(() => {
      const current = player?.state.currentTrack;
      const position = player?.state.position;
      if (current?.mediaType === 'audiobook' && position && position > 30000 && !seekingRef.current) {
        saveResumePosition(current.torrentName, current.id, position);
      }
    }, 5000);
    return () => { if (saveIntervalRef.current) clearInterval(saveIntervalRef.current); };
  }, [player?.state.currentTrack]);

  const onRefresh = async () => {
    if (!apiKey) return;
    setRefreshing(true);
    await library.refresh(apiKey);
    setRefreshing(false);
  };

  const audiobooks = library.tracks.filter(t => t.mediaType === 'audiobook');

  const audiobookGroups: Record<string, AudioTrack[]> = {};
  for (const t of audiobooks) {
    if (!audiobookGroups[t.torrentName]) audiobookGroups[t.torrentName] = [];
    audiobookGroups[t.torrentName].push(t);
  }

  const groupList: AudiobookGroup[] = Object.entries(audiobookGroups)
    .map(([torrentName, tracks]) => ({ torrentName, tracks }))
    .sort((a, b) => {
      const aName = cleanTorrentName(a.torrentName).album || a.torrentName;
      const bName = cleanTorrentName(b.torrentName).album || b.torrentName;
      return aName.localeCompare(bName);
    });

  const handlePlay = (track: AudioTrack, queue: AudioTrack[], seekToMs?: number) => {
    const p = getPlayer();
    // Patch local URIs for offline playback
    const localUri = getLocalUri(track.id);
    const patchedTrack = localUri ? { ...track, streamUrl: localUri } : track;
    const patchedQueue = queue.map(qt => {
      const lu = getLocalUri(qt.id);
      return lu ? { ...qt, streamUrl: lu } : qt;
    });
    p?.play(patchedTrack, patchedQueue);
    if (seekToMs && seekToMs > 0) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        // Always get fresh player ref to avoid stale closure
        const livePlayer = getPlayer();
        const dur = livePlayer?.state.duration;
        const isLoading = livePlayer?.state.isLoading;
        const trackId = livePlayer?.state.currentTrack?.id;
        if (dur && dur > 0 && !isLoading && trackId === track.id) {
          clearInterval(interval);
          seekingRef.current = true;
          livePlayer?.seekTo(seekToMs);
          // Allow saves again after 3 seconds
          setTimeout(() => { seekingRef.current = false; }, 3000);
        } else if (attempts > 120) {
          seekingRef.current = false;
          clearInterval(interval);
        }
      }, 500);
    }
  };

  const handleResume = async (group: AudiobookGroup) => {
    if (resumingRef.current) return;
    resumingRef.current = true;
    setTimeout(() => { resumingRef.current = false; }, 3000);
    const resume = getResumePosition(group.torrentName);
    if (!resume) {
      handlePlay(group.tracks[0], group.tracks);
      return;
    }

    const track = group.tracks.find(t => t.id === resume.trackId) || group.tracks[0];
    const idx = group.tracks.findIndex(t => t.id === track.id);

    // If already downloaded locally, seeking will work reliably
    const localUri = getLocalUri(track.id);
    if (localUri) {
      handlePlay(track, group.tracks.slice(idx), resume.position);
      return;
    }

    // Not downloaded — stream but warn that seek may be unreliable
    handlePlay(track, group.tracks.slice(idx), resume.position);
  };

  // ── Book detail ──────────────────────────────────────────────────────────
  if (selectedBook) {
    const { torrentName, tracks } = selectedBook;
    const { artist, album, clean } = cleanTorrentName(torrentName);
    const chapters = parseChapters(tracks);
    const resume = getResumePosition(torrentName);
    const totalSize = tracks.reduce((s, t) => s + t.size, 0);
    const currentTrackId = player?.state.currentTrack?.id;
    const isThisBookPlaying = tracks.some(t => t.id === currentTrackId);

    const resumeChapter = resume ? chapters.find(c => c.trackId === resume.trackId) : null;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.detailScroll}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setSelectedBook(null)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Cover + Info */}
          <View style={styles.detailTop}>
            <BookCover torrentName={torrentName} width={160} borderRadius={12} />
            <View style={styles.detailInfo}>
              <Text style={styles.detailTitle} numberOfLines={3}>{album || clean}</Text>
              {artist ? <Text style={styles.detailAuthor}>{artist}</Text> : null}
              <Text style={styles.detailMeta}>{chapters.length} chapters · {formatFileSize(totalSize)}</Text>

              {/* Resume or Play button */}
              {resume && resumeChapter ? (
                <View style={styles.detailActions}>
                  <TouchableOpacity style={styles.resumeBtn} onPress={() => handleResume(selectedBook)}>
                    <Ionicons name="play" size={16} color={Colors.white} />
                    <Text style={styles.resumeBtnText}>Resume</Text>
                  </TouchableOpacity>
                  <Text style={styles.resumeChapter} numberOfLines={1}>
                    {resumeChapter.title}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.resumeBtn} onPress={() => handlePlay(tracks[0], tracks)}>
                  <Ionicons name="play" size={16} color={Colors.white} />
                  <Text style={styles.resumeBtnText}>Play</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => downloadAlbum(tracks)}
              >
                <Ionicons
                  name={isTrackDownloaded(tracks[0].id) ? 'checkmark-circle' : 'arrow-down-circle-outline'}
                  size={16}
                  color={Colors.accent}
                />
                <Text style={styles.downloadBtnText}>
                  {isTrackDownloaded(tracks[0].id) ? 'Downloaded' : 'Download'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Chapters / Tracks */}
          <Text style={styles.chaptersHeading}>Chapters</Text>

          {chapters.map((chapter, i) => {
            const track = tracks[i];
            const isActive = currentTrackId === chapter.trackId;
            const isPlaying = isActive && (player?.state.isPlaying ?? false);
            const isResumePoint = resume?.trackId === chapter.trackId;
            return (
              <TouchableOpacity
                key={chapter.trackId}
                style={[styles.chapterRow, isActive && styles.chapterActive]}
                onPress={() => handlePlay(track, tracks.slice(i),
                  isResumePoint ? resume?.position : undefined)}
                activeOpacity={0.7}
              >
                <View style={styles.chapterLeft}>
                  {isActive
                    ? <Ionicons name={isPlaying ? 'musical-notes' : 'pause'} size={14} color={Colors.accent} />
                    : <Text style={styles.chapterIndex}>{i + 1}</Text>
                  }
                </View>
                <View style={styles.chapterInfo}>
                  <Text style={[styles.chapterTitle, isActive && styles.chapterTitleActive]} numberOfLines={1}>
                    {chapter.title}
                  </Text>
                  <View style={styles.chapterMeta}>
                    <Text style={styles.chapterSize}>{formatFileSize(chapter.size)}</Text>
                    {isResumePoint && resume && (
                      <>
                        <Text style={styles.dot}>·</Text>
                        <Text style={styles.resumeTag}>SAVED</Text>
                      </>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  if (library.loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Books</Text>
        <Text style={styles.headerCount}>{groupList.length} audiobooks</Text>
      </View>

      {groupList.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={64} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No Audiobooks</Text>
            <Text style={styles.emptyText}>
              Audiobooks are detected from .m4b files or torrents with "audiobook" in the name
            </Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={groupList}
          keyExtractor={item => item.torrentName}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.gridScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          renderItem={({ item }) => {
            const { album, artist, clean } = cleanTorrentName(item.torrentName);
            const resume = getResumePosition(item.torrentName);
            const isActive = item.tracks.some(t => t.id === player?.state.currentTrack?.id);
            const progress = resume
              ? item.tracks.findIndex(t => t.id === resume.trackId) / item.tracks.length
              : 0;

            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => setSelectedBook(item)}
                activeOpacity={0.8}
              >
                <View style={styles.cardCover}>
                  <BookCover torrentName={item.torrentName} width={CARD_WIDTH} borderRadius={10} />
                  {isActive && (
                    <View style={styles.playingBadge}>
                      <Ionicons name="musical-notes" size={12} color={Colors.white} />
                    </View>
                  )}
                  {item.tracks.some(t => dlProgress[t.id]?.status === 'downloading') && (
                    <View style={styles.downloadingBadge}>
                      <Ionicons name="arrow-down" size={10} color={Colors.white} />
                      <Text style={styles.downloadingPct}>
                        {Math.round((item.tracks.reduce((s, t) => s + (dlProgress[t.id]?.progress || 0), 0) / item.tracks.length) * 100)}%
                      </Text>
                    </View>
                  )}
                  {progress > 0 && (
                    <View style={styles.progressBarBg}>
                      <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={2}>{album || clean}</Text>
                {artist ? <Text style={styles.cardAuthor} numberOfLines={1}>{artist}</Text> : null}
                <Text style={styles.cardChapters}>{item.tracks.length} chapters</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  headerCount: { color: Colors.textMuted, fontSize: 13 },
  row: { justifyContent: 'space-between', marginBottom: 24 },
  gridScroll: { paddingHorizontal: 16, paddingBottom: 120 },
  card: { width: CARD_WIDTH },
  cardCover: { position: 'relative', marginBottom: 8 },
  playingBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: Colors.accent, borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  progressBarBg: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },
  progressBarFill: { height: 4, backgroundColor: Colors.accent, borderBottomLeftRadius: 10 },
  cardTitle: { color: Colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardAuthor: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  cardChapters: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  // Detail
  detailScroll: { paddingBottom: 120 },
  detailHeader: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  backBtn: { padding: 4, alignSelf: 'flex-start' },
  detailTop: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 16,
    paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  detailInfo: { flex: 1, justifyContent: 'center', gap: 6 },
  detailTitle: { color: Colors.text, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  detailAuthor: { color: Colors.textSecondary, fontSize: 14 },
  detailMeta: { color: Colors.textMuted, fontSize: 12 },
  detailActions: { gap: 4 },
  resumeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start', marginTop: 4,
  },
  resumeBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  resumeChapter: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  chaptersHeading: {
    color: Colors.text, fontSize: 18, fontWeight: '800',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10,
  },
  chapterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  chapterActive: { backgroundColor: Colors.accentMuted },
  chapterLeft: { width: 24, alignItems: 'center' },
  chapterIndex: { color: Colors.textMuted, fontSize: 13 },
  chapterInfo: { flex: 1 },
  chapterTitle: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  chapterTitleActive: { color: Colors.accent },
  chapterMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  chapterSize: { color: Colors.textMuted, fontSize: 11 },
  dot: { color: Colors.textMuted, fontSize: 11 },
  resumeTag: { color: Colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  emptyScroll: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  singleFileNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 16, marginBottom: 8, padding: 12,
    backgroundColor: Colors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  singleFileNoteText: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
  },
  downloadBtnText: { color: Colors.accent, fontSize: 12 },
  downloadingBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: Colors.accent, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  downloadingPct: { color: Colors.white, fontSize: 9, fontWeight: '800' },
});
