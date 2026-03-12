import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import { AudioTrack, formatFileSize } from '../services/torbox';
import { DownloadProgress } from '../services/downloads';

interface Props {
  track: AudioTrack;
  isActive: boolean;
  isPlaying: boolean;
  onPress: () => void;
  onMenu?: (track: AudioTrack) => void;
  onDownload?: (track: AudioTrack) => void;
  index?: number;
  downloadProgress?: DownloadProgress | null;
  isDownloaded?: boolean;
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

function ProgressArc({ progress }: { progress: number }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Spin animation for indeterminate feel while downloading
    animRef.current = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animRef.current.start();
    return () => animRef.current?.stop();
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pct = Math.round(progress * 100);

  return (
    <View style={arc.container}>
      <Animated.View style={[arc.ring, { transform: [{ rotate: spin }] }]} />
      <Text style={arc.text}>{pct}</Text>
    </View>
  );
}

const arc = StyleSheet.create({
  container: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderTopColor: 'transparent',
  },
  text: {
    color: Colors.accent, fontSize: 7, fontWeight: '800',
  },
});

function DownloadButton({ progress, isDownloaded, onPress }: {
  progress?: DownloadProgress | null;
  isDownloaded?: boolean;
  onPress: () => void;
}) {
  if (isDownloaded) {
    return (
      <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
      </TouchableOpacity>
    );
  }

  if (progress?.status === 'downloading') {
    return <ProgressArc progress={progress.progress || 0} />;
  }

  if (progress?.status === 'error') {
    return (
      <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="alert-circle-outline" size={20} color="#e74c3c" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="arrow-down-circle-outline" size={20} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export function TrackRow({
  track, isActive, isPlaying, onPress, onMenu, onDownload,
  index, downloadProgress, isDownloaded,
}: Props) {
  const extColor = EXT_COLORS[track.extension] || Colors.textSecondary;

  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.active]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.left}>
        {isActive ? (
          <View style={styles.playingIndicator}>
            <Ionicons name={isPlaying ? 'musical-notes' : 'pause'} size={16} color={Colors.accent} />
          </View>
        ) : (
          <Text style={styles.index}>{index !== undefined ? index + 1 : ''}</Text>
        )}
      </View>

      <View style={styles.info}>
        <Text style={[styles.title, isActive && styles.titleActive]} numberOfLines={1}>
          {track.displayName}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.ext, { color: extColor }]}>
            {track.extension.replace('.', '').toUpperCase()}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.size}>{formatFileSize(track.size)}</Text>
          {isDownloaded && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.offlineTag}>OFFLINE PLAY</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        {onDownload && (
          <DownloadButton
            progress={downloadProgress}
            isDownloaded={isDownloaded}
            onPress={() => onDownload(track)}
          />
        )}
        <TouchableOpacity
          onPress={() => onMenu?.(track)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.menuBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16, gap: 12,
  },
  active: { backgroundColor: Colors.accentMuted },
  left: { width: 28, alignItems: 'center' },
  playingIndicator: { width: 28, alignItems: 'center' },
  index: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  info: { flex: 1 },
  title: { color: Colors.text, fontSize: 14, fontWeight: '500' },
  titleActive: { color: Colors.accent },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  ext: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  dot: { color: Colors.textMuted, fontSize: 11 },
  size: { color: Colors.textMuted, fontSize: 11 },
  offlineTag: { color: Colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuBtn: { padding: 4 },
});
