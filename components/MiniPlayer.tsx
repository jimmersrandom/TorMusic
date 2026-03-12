import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { PlayerState } from '../hooks/usePlayer';

interface Props {
  state: PlayerState;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onPress: () => void;
}

export function MiniPlayer({ state, onTogglePlay, onSkipNext, onPress }: Props) {
  if (!state.currentTrack) return null;

  const { currentTrack, isPlaying, isLoading, isBuffering, progress, loadingProgress } = state;
  const isDownloading = isLoading && loadingProgress > 0 && loadingProgress < 1;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      {/* Progress bar — shows download progress or playback progress */}
      <View style={styles.progressBar}>
        <View style={[
          styles.progressFill,
          isDownloading && styles.progressDownload,
          { width: `${(isDownloading ? loadingProgress : progress) * 100}%` }
        ]} />
      </View>

      <View style={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{currentTrack.extension.replace('.', '').toUpperCase()}</Text>
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{currentTrack.displayName}</Text>
          {isDownloading ? (
            <Text style={styles.downloadText}>
              Downloading... {Math.round(loadingProgress * 100)}%
            </Text>
          ) : (
            <Text style={styles.album} numberOfLines={1}>{currentTrack.torrentName}</Text>
          )}
        </View>

        <View style={styles.controls}>
          {isLoading ? (
            <ActivityIndicator color={Colors.accent} size="small" />
          ) : (
            <TouchableOpacity onPress={onTogglePlay} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color={Colors.text}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onSkipNext}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginLeft: 16 }}
          >
            <Ionicons name="play-skip-forward" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  progressBar: {
    height: 2,
    backgroundColor: Colors.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: Colors.accent,
  },
  progressDownload: {
    backgroundColor: '#4ec9b0',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  badge: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  badgeText: {
    color: Colors.accent,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  info: { flex: 1 },
  title: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  album: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  downloadText: { color: '#4ec9b0', fontSize: 12, marginTop: 1 },
  controls: { flexDirection: 'row', alignItems: 'center' },
});
