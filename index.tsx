import React, { useEffect, useState } from 'react';
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useLibrary } from '../../hooks/useLibrary';
import { TrackRow } from '../../components/TrackRow';
import { getPlayer } from './_layout';
import { getStoredApiKey, AudioTrack } from '../../services/torbox';
import { useRouter } from 'expo-router';

export default function LibraryScreen() {
  const router = useRouter();
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
          <Text style={styles.emptyText}>Add your Torbox API key in Settings to get started.</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Text style={styles.settingsBtnText}>Go to Settings</Text>
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
          <Text style={styles.loadingText}>Loading your music library...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (library.error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.accent} />
          <Text style={styles.emptyTitle}>Error</Text>
          <Text style={styles.emptyText}>{library.error}</Text>
          <TouchableOpacity style={styles.settingsBtn} onPress={() => library.fetchLibrary(apiKey)}>
            <Text style={styles.settingsBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Build album sections
  const albumGroups = library.albumGroups;
  const filteredAlbums = Object.entries(albumGroups)
    .filter(([name]) => !search || name.toLowerCase().includes(search.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  const sections = filteredAlbums.map(([name, tracks]) => ({
    title: name,
    data: tracks.filter(t =>
      !search || t.displayName.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(s => s.data.length > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Albums</Text>
        <Text style={styles.headerCount}>{library.tracks.length} tracks</Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search albums or tracks..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <Ionicons name="albums" size={14} color={Colors.accent} />
            </View>
            <Text style={styles.sectionTitle} numberOfLines={1}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isActive = player?.state.currentTrack?.id === item.id;
          return (
            <TrackRow
              track={item}
              isActive={isActive}
              isPlaying={isActive && (player?.state.isPlaying ?? false)}
              onPress={() => handlePlay(item, section.data)}
              index={index}
            />
          );
        }}
        stickySectionHeadersEnabled={true}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No audio files found</Text>
            <Text style={styles.emptyText}>
              No audio files were found in your Torbox library. Make sure your torrents contain audio files.
            </Text>
          </View>
        }
        contentContainerStyle={library.tracks.length === 0 ? { flex: 1 } : undefined}
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
  headerCount: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { marginRight: 6 },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionIcon: {
    width: 22,
    height: 22,
    backgroundColor: Colors.accentMuted,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCount: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  settingsBtn: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  settingsBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
