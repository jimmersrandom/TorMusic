import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useLibrary } from '../../hooks/useLibrary';
import { TrackRow } from '../../components/TrackRow';
import { getPlayer } from './_layout';
import { getStoredApiKey, AudioTrack } from '../../services/torbox';
import { useRouter } from 'expo-router';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function RecentScreen() {
  const router = useRouter();
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      const key = await getStoredApiKey();
      setApiKey(key);
      if (key) library.fetchLibrary(key);
    })();
  }, []);

  const onRefresh = async () => {
    if (!apiKey) return;
    setRefreshing(true);
    await library.refresh(apiKey);
    setRefreshing(false);
  };

  const player = getPlayer();

  const handlePlay = (track: AudioTrack, queue: AudioTrack[]) => {
    player?.play(track, queue);
  };

  if (!apiKey) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="key-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No API Key</Text>
          <Text style={styles.emptyText}>Add your Torbox API key in Settings.</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push('/(tabs)/settings')}>
            <Text style={styles.btnText}>Go to Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (library.loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading recent tracks...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const recentTracks = library.recentTracks;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recent</Text>
        <Text style={styles.headerCount}>{recentTracks.length} tracks</Text>
      </View>

      <FlatList
        data={recentTracks}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        renderItem={({ item, index }) => {
          const isActive = player?.state.currentTrack?.id === item.id;
          return (
            <View>
              {(index === 0 || recentTracks[index - 1]?.addedAt.slice(0, 10) !== item.addedAt.slice(0, 10)) && (
                <View style={styles.dateHeader}>
                  <Text style={styles.dateText}>
                    {timeAgo(item.addedAt)}
                  </Text>
                </View>
              )}
              <TrackRow
                track={item}
                isActive={isActive}
                isPlaying={isActive && (player?.state.isPlaying ?? false)}
                onPress={() => handlePlay(item, recentTracks)}
                index={index}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No recent tracks</Text>
            <Text style={styles.emptyText}>Your recently added audio files will appear here.</Text>
          </View>
        }
        contentContainerStyle={recentTracks.length === 0 ? { flex: 1 } : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  headerCount: { color: Colors.textMuted, fontSize: 13 },
  dateHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  dateText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: {
    marginTop: 8, backgroundColor: Colors.accent,
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12,
  },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
