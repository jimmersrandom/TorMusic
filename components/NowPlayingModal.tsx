import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, TouchableWithoutFeedback, Animated,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { PlayerState } from '../hooks/usePlayer';
import { formatFileSize } from '../services/torbox';
import { AlbumArt } from './AlbumArt';
import { BookCover } from './BookCover';
import { useLyrics } from '../hooks/useLyrics';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  state: PlayerState;
  onClose: () => void;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrev: () => void;
  onSeek: (progress: number) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const EXT_COLORS: Record<string, string> = {
  '.flac': '#4ec9b0',
  '.mp3': '#9b9b9b',
  '.aac': '#569cd6',
  '.m4a': '#569cd6',
  '.wav': '#dcdcaa',
  '.ogg': '#c586c0',
  '.opus': '#c586c0',
};

export function NowPlayingModal({
  visible, state, onClose, onTogglePlay, onSkipNext, onSkipPrev,
  onSeek, onDragStart, onDragEnd, onToggleShuffle, onToggleRepeat,
}: Props) {
  const {
    currentTrack, isPlaying, isLoading, progress,
    positionDisplay, durationDisplay, shuffle, repeat, position, duration,
  } = state;

  const [showLyrics, setShowLyrics] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const lineHeightRef = useRef(36);
  const artSize = width - 80;
  const bookArtWidth = Math.round((width - 80) * 0.6); // narrower for portrait covers

  // Reset to art view when track changes
  useEffect(() => {
    setShowLyrics(false);
    Animated.timing(flipAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [currentTrack?.id]);

  const lyrics = useLyrics(
    currentTrack?.id ?? null,
    currentTrack?.artist ?? '',
    currentTrack?.displayName ?? '',
    currentTrack?.album ?? '',
    duration,
    position,
    showLyrics,
  );

  // Auto-scroll to active line
  useEffect(() => {
    if (!showLyrics || !lyrics.isSynced || lyrics.activeLine < 2) return;
    scrollRef.current?.scrollTo({
      y: (lyrics.activeLine - 2) * lineHeightRef.current,
      animated: true,
    });
  }, [lyrics.activeLine, showLyrics]);

  const handleArtPress = () => {
    const toValue = showLyrics ? 0 : 1;
    setShowLyrics(!showLyrics);
    Animated.spring(flipAnim, {
      toValue,
      useNativeDriver: true,
      tension: 60,
      friction: 8,
    }).start();
  };

  if (!currentTrack) return null;

  const extColor = EXT_COLORS[currentTrack.extension] || Colors.textSecondary;
  const repeatIcon = repeat === 'one' ? 'repeat-outline' : 'repeat';

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="chevron-down" size={28} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerLabel}>
            {showLyrics ? 'LYRICS' : 'NOW PLAYING'}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Flippable art / lyrics card */}
        <TouchableWithoutFeedback onPress={handleArtPress}>
          <View style={[styles.artwork, { width: artSize, height: currentTrack.mediaType === 'audiobook' ? Math.round(bookArtWidth * 1.5) : artSize }]}>

            {/* Front: Album Art */}
            <Animated.View
              style={[
                styles.cardFace,
                { width: artSize, height: artSize },
                { opacity: frontOpacity, transform: [{ rotateY: frontRotate }] },
              ]}
            >
              {currentTrack.mediaType === 'audiobook'
                ? <BookCover torrentName={currentTrack.torrentName} width={bookArtWidth} borderRadius={16} />
                : <AlbumArt torrentName={currentTrack.torrentName} size={artSize} borderRadius={16} />
              }
              <View style={[styles.extBadge, { borderColor: extColor }]}>
                <Text style={[styles.extBadgeText, { color: extColor }]}>
                  {currentTrack.extension.replace('.', '').toUpperCase()}
                </Text>
              </View>
            </Animated.View>

            {/* Back: Lyrics */}
            <Animated.View
              style={[
                styles.cardFace,
                styles.lyricsCard,
                { width: artSize, height: artSize },
                { opacity: backOpacity, transform: [{ rotateY: backRotate }] },
              ]}
            >
              {lyrics.isLoading ? (
                <Text style={styles.lyricsStatus}>Finding lyrics…</Text>
              ) : lyrics.error ? (
                <Text style={styles.lyricsStatus}>{lyrics.error}</Text>
              ) : lyrics.isSynced ? (
                <ScrollView
                  ref={scrollRef}
                  style={styles.lyricsScroll}
                  contentContainerStyle={styles.lyricsContent}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={true}
                >
                  {lyrics.lines.map((line, i) => (
                    <Text
                      key={i}
                      onLayout={i === 0 ? (e) => { lineHeightRef.current = e.nativeEvent.layout.height; } : undefined}
                      style={[
                        styles.lyricLine,
                        i === lyrics.activeLine && styles.lyricLineActive,
                        i < lyrics.activeLine && styles.lyricLinePast,
                      ]}
                    >
                      {line.text}
                    </Text>
                  ))}
                </ScrollView>
              ) : lyrics.plain ? (
                <ScrollView
                  style={styles.lyricsScroll}
                  contentContainerStyle={styles.lyricsContent}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.lyricPlain}>{lyrics.plain}</Text>
                </ScrollView>
              ) : null}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>

        {/* Tap hint — below the card, toggles with state */}
        <TouchableOpacity onPress={handleArtPress} style={styles.tapHintRow}>
          <Ionicons
            name={showLyrics ? 'image-outline' : 'musical-notes-outline'}
            size={13}
            color={Colors.textMuted}
          />
          <Text style={styles.tapHintText}>
            {showLyrics ? 'tap for artwork' : 'tap for lyrics'}
          </Text>
        </TouchableOpacity>

        {/* Track info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackName} numberOfLines={2}>{currentTrack.displayName}</Text>
          <Text style={styles.albumName} numberOfLines={1}>{currentTrack.torrentName}</Text>
          <Text style={styles.fileSize}>{formatFileSize(currentTrack.size)}</Text>
        </View>

        {/* Seek bar */}
        <View style={styles.seekSection}>
          <Slider
            key={state.queueIndex + '-' + currentTrack?.id}
            style={{ width: width - 48, height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={state.isLoading ? 0 : progress}
            minimumTrackTintColor={Colors.accent}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.accent}
            onSlidingStart={() => onDragStart?.()}
            onSlidingComplete={(val) => { onSeek(val); onDragEnd?.(); }}
          />
          <View style={styles.timeRow}>
            <Text style={styles.time}>{positionDisplay}</Text>
            <Text style={styles.time}>{durationDisplay}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity onPress={onToggleShuffle} style={styles.controlBtn}>
            <Ionicons name="shuffle" size={22} color={shuffle ? Colors.accent : Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkipPrev} style={styles.controlBtn}>
            <Ionicons name="play-skip-back" size={30} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onTogglePlay} style={styles.playBtn} disabled={isLoading}>
            {isLoading ? (
              <View style={styles.loadingRing} />
            ) : (
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color={Colors.white} />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkipNext} style={styles.controlBtn}>
            <Ionicons name="play-skip-forward" size={30} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleRepeat} style={styles.controlBtn}>
            <Ionicons name={repeatIcon} size={22} color={repeat !== 'none' ? Colors.accent : Colors.textSecondary} />
            {repeat === 'one' && <View style={styles.repeatOneDot} />}
          </TouchableOpacity>
        </View>

        <View style={styles.queueInfo}>
          <Text style={styles.queueText}>{state.queueIndex + 1} of {state.queue.length} tracks</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingTop: 16, paddingBottom: 8,
  },
  closeBtn: { width: 44, height: 44, justifyContent: 'center' },
  headerLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  artwork: {
    alignSelf: 'center',
    marginTop: 24,
    marginBottom: 0,
    position: 'relative',
  },
  cardFace: {
    position: 'absolute',
    top: 0, left: 0,
    backfaceVisibility: 'hidden',
  },

  // Tap hint row
  tapHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    marginBottom: 8,
  },
  tapHintText: { color: Colors.textMuted, fontSize: 11 },

  // Lyrics card
  lyricsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lyricsScroll: { flex: 1, width: '100%' },
  lyricsContent: { paddingVertical: 24, paddingHorizontal: 20 },
  lyricLine: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 36,
    textAlign: 'center',
  },
  lyricLineActive: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  lyricLinePast: {
    color: Colors.textMuted,
    opacity: 0.5,
  },
  lyricPlain: {
    color: Colors.textSecondary,
    fontSize: 15,
    lineHeight: 26,
    textAlign: 'center',
  },
  lyricsStatus: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },

  // Art overlays
  extBadge: {
    position: 'absolute', bottom: 24, right: 16,
    backgroundColor: Colors.surface,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  extBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Track info
  trackInfo: { marginBottom: 24 },
  trackName: { color: Colors.text, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  albumName: { color: Colors.textSecondary, fontSize: 15, marginTop: 6 },
  fileSize: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },

  // Seek
  seekSection: { marginBottom: 28 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { color: Colors.textMuted, fontSize: 12 },

  // Controls
  controls: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 24,
  },
  controlBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  playBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  loadingRing: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 3, borderColor: Colors.white, borderTopColor: 'transparent',
  },
  repeatOneDot: {
    position: 'absolute', bottom: 6, width: 4, height: 4,
    borderRadius: 2, backgroundColor: Colors.accent,
  },
  queueInfo: { alignItems: 'center' },
  queueText: { color: Colors.textMuted, fontSize: 12 },
});
