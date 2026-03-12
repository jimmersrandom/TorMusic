import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, TextInput, Dimensions,
  ScrollView, Modal, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../../constants/colors';
import { useLibrary } from '../../hooks/useLibrary';
import { TrackRow } from '../../components/TrackRow';
import { AlbumArt } from '../../components/AlbumArt';
import { ArtistImage } from '../../components/ArtistImage';
import { PlaylistSheet } from '../../components/PlaylistSheet';
import { PlaylistCard } from '../../components/PlaylistCard';
import { getPlayer } from './_layout';
import {
  getStoredApiKey, AudioTrack, cleanTorrentName,
  fetchMetadataFromMusicBrainz, setMetadataOverride, getMetadataOverride,
} from '../../services/torbox';
import {
  getPlaylists, createPlaylist, deletePlaylist, renamePlaylist,
  removeTrackFromPlaylist, setPlaylistCover,
  invalidateCache, Playlist,
} from '../../services/playlists';
import {
  downloadTrack, downloadAlbum, deleteDownload,
  isTrackDownloaded, getLocalUri, getAllDownloadedTracks,
  subscribeToDownloadProgress, loadDownloads,
  DownloadProgress,
} from '../../services/downloads';
import { registerLibraryReset, clearLibraryReset } from './_layout';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;
const SMALL_CARD = 140;
const HOME_SECTION_LIMIT = 6;

// ─── Album Card ───────────────────────────────────────────────────────────────
function AlbumCard({ torrentName, tracks, isActiveAlbum, downloadedCount, onPress }: {
  torrentName: string; tracks: AudioTrack[]; isActiveAlbum: boolean;
  downloadedCount: number; onPress: () => void;
}) {
  const { artist, album, year, clean } = cleanTorrentName(torrentName);
  const allDownloaded = downloadedCount === tracks.length && tracks.length > 0;
  const someDownloaded = downloadedCount > 0 && !allDownloaded;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardArtContainer}>
        <AlbumArt torrentName={torrentName} size={CARD_SIZE} borderRadius={12} />
        {isActiveAlbum && (
          <View style={styles.playingBadge}>
            <Ionicons name="musical-notes" size={12} color={Colors.white} />
          </View>
        )}
        {year ? <View style={styles.yearBadge}><Text style={styles.yearText}>{year}</Text></View> : null}
        {allDownloaded && (
          <View style={styles.downloadedBadge}>
            <Ionicons name="arrow-down-circle" size={16} color={Colors.white} />
          </View>
        )}
        {someDownloaded && (
          <View style={[styles.downloadedBadge, { backgroundColor: 'rgba(255,107,53,0.6)' }]}>
            <Text style={styles.downloadedBadgeText}>{downloadedCount}/{tracks.length}</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardAlbum} numberOfLines={1}>{album || clean}</Text>
      {artist ? <Text style={styles.cardArtist} numberOfLines={1}>{artist}</Text> : null}
      <Text style={styles.cardCount}>{tracks.length} tracks</Text>
    </TouchableOpacity>
  );
}

// ─── Small horizontal card ────────────────────────────────────────────────────
function SmallCard({ torrentName, tracks, isActiveAlbum, onPress }: {
  torrentName: string; tracks: AudioTrack[]; isActiveAlbum: boolean; onPress: () => void;
}) {
  const { artist, album, clean } = cleanTorrentName(torrentName);
  return (
    <TouchableOpacity style={styles.smallCard} onPress={onPress} activeOpacity={0.8}>
      <View style={{ position: 'relative' }}>
        <AlbumArt torrentName={torrentName} size={SMALL_CARD} borderRadius={10} />
        {isActiveAlbum && (
          <View style={styles.playingBadge}>
            <Ionicons name="musical-notes" size={12} color={Colors.white} />
          </View>
        )}
      </View>
      <Text style={styles.smallCardAlbum} numberOfLines={1}>{album || clean}</Text>
      {artist ? <Text style={styles.smallCardArtist} numberOfLines={1}>{artist}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── Artist Card ──────────────────────────────────────────────────────────────
function ArtistCard({ artist, albums, onPress }: {
  artist: string; albums: string[]; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.artistCard} onPress={onPress} activeOpacity={0.8}>
      <ArtistImage artist={artist} fallbackTorrentName={albums[0]} size={SMALL_CARD} borderRadius={SMALL_CARD / 2} />
      <Text style={styles.artistName} numberOfLines={1}>{artist}</Text>
      <Text style={styles.artistCount}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</Text>
    </TouchableOpacity>
  );
}

// ─── Section Heading ──────────────────────────────────────────────────────────
function SectionHeading({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <View style={styles.sectionHeadingRow}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={styles.seeAll}>See All</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const library = useLibrary();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [artRefreshKey, setArtRefreshKey] = useState(0);
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'albums' | 'artists' | 'playlists'>('home');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [showPlaylistSheet, setShowPlaylistSheet] = useState(false);
  const [menuTrack, setMenuTrack] = useState<AudioTrack | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Download state
  const [dlProgress, setDlProgress] = useState<Record<string, DownloadProgress>>({});
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDownloads().then(() => {
      setDownloadedIds(new Set(getAllDownloadedTracks().map(r => r.trackId)));
    });
    const unsub = subscribeToDownloadProgress((state) => {
    setDlProgress({ ...state });
      setDownloadedIds(new Set(getAllDownloadedTracks().map(r => r.trackId)));
    });
    return unsub;
  }, []);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const key = await getStoredApiKey();
      if (!mounted) return;
      setApiKey(key);
      if (key) library.fetchLibrary(key);
      registerLibraryReset(() => {
        setSelectedAlbum(null);
        setSelectedArtist(null);
        setSelectedPlaylist(null);
        setActiveTab('home');
      });
    })();
    return () => { mounted = false; clearLibraryReset(); };
  }, []);

  const loadPlaylists = useCallback(async () => {
    invalidateCache();
    const pls = await getPlaylists();
    setPlaylists(pls);
  }, []);

  useEffect(() => {
    if (activeTab === 'playlists') loadPlaylists();
  }, [activeTab]);

  useEffect(() => { loadPlaylists(); }, []);

  const onRefresh = async () => {
    if (!apiKey) return;
    setRefreshing(true);
    await library.refresh(apiKey);
    await loadPlaylists();
    setRefreshing(false);
  };

  const player = getPlayer();
  const handlePlay = (track: AudioTrack, queue: AudioTrack[]) => {
    // If track is downloaded, patch the URI before playing
    const localUri = getLocalUri(track.id);
    const t = localUri ? { ...track, streamUrl: localUri } : track;
    const q = queue.map(qt => {
      const lu = getLocalUri(qt.id);
      return lu ? { ...qt, streamUrl: lu } : qt;
    });
    player?.play(t, q);
  };

  const handlePickCover = async (playlistId: string) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await setPlaylistCover(playlistId, result.assets[0].uri);
      invalidateCache();
      const updated = await getPlaylists();
      setPlaylists(updated);
      if (selectedPlaylist?.id === playlistId) {
        setSelectedPlaylist(prev => prev ? { ...prev, coverUri: result.assets[0].uri } : prev);
      }
    }
  };

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

  const albumGroups = library.albumGroups;
  const allTracks = Object.values(albumGroups).flat();

  const recentAlbums = Object.entries(albumGroups)
    .sort(([, a], [, b]) => new Date(b[0].addedAt).getTime() - new Date(a[0].addedAt).getTime());

  const allAlbums = Object.entries(albumGroups)
    .filter(([name]) => !search || cleanTorrentName(name).clean.toLowerCase().includes(search.toLowerCase()))
    .sort(([a], [b]) => {
      const aA = albumGroups[a]?.[0]?.artist || cleanTorrentName(a).artist || a;
      const bA = albumGroups[b]?.[0]?.artist || cleanTorrentName(b).artist || b;
      return aA.localeCompare(bA);
    });

  const artistMap: Record<string, string[]> = {};
  Object.keys(albumGroups).forEach(torrentName => {
    const firstTrack = albumGroups[torrentName]?.[0];
    const rawKey = firstTrack?.artist || cleanTorrentName(torrentName).artist || 'Unknown Artist';
    const normKey = rawKey.toLowerCase();
    const existingKey = Object.keys(artistMap).find(k => k.toLowerCase() === normKey);
    const key = existingKey || rawKey;
    if (!artistMap[key]) artistMap[key] = [];
    artistMap[key].push(torrentName);
  });
  const allArtists = Object.entries(artistMap)
    .filter(([name]) => !search || name.toLowerCase().includes(search.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  // Downloaded tracks for Downloads section
  const downloadedTrackList = allTracks.filter(t => downloadedIds.has(t.id));

  // ── Album detail ───────────────────────────────────────────────────────────
  if (selectedAlbum && albumGroups[selectedAlbum]) {
    const tracks = albumGroups[selectedAlbum];
    const { artist: rawArtist, album: rawAlbum, year: rawYear, clean } = cleanTorrentName(selectedAlbum);
    const override = getMetadataOverride(selectedAlbum);
    const artist = override?.artist || rawArtist;
    const album = override?.album || rawAlbum;
    const year = override?.year || rawYear;
    const albumDownloadedCount = tracks.filter(t => downloadedIds.has(t.id)).length;
    const allAlbumDownloaded = albumDownloadedCount === tracks.length;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.albumHeader}>
          <View style={styles.albumHeaderRow}>
            <TouchableOpacity onPress={() => setSelectedAlbum(null)} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAlbumMenu(true)} style={styles.menuBtn}>
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <AlbumArt key={artRefreshKey} torrentName={selectedAlbum} size={160} borderRadius={16} />
          <Text style={styles.albumHeaderAlbum} numberOfLines={2}>{album || clean}</Text>
          {artist ? <Text style={styles.albumHeaderArtist}>{artist}</Text> : null}
          {year ? <Text style={styles.albumHeaderYear}>{year}</Text> : null}
          <View style={styles.albumHeaderActions}>
            <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlay(tracks[0], tracks)}>
              <Ionicons name="play" size={20} color={Colors.white} />
              <Text style={styles.playAllText}>Play All</Text>
            </TouchableOpacity>
            {!allAlbumDownloaded && (
              <TouchableOpacity
                style={styles.downloadAlbumBtn}
                onPress={() => downloadAlbum(tracks)}
              >
                <Ionicons name="arrow-down-circle-outline" size={20} color={Colors.accent} />
                <Text style={styles.downloadAlbumText}>Download</Text>
              </TouchableOpacity>
            )}
          </View>
          {albumDownloadedCount > 0 && (
            <Text style={styles.downloadedCount}>
              {allAlbumDownloaded ? 'All tracks downloaded' : `${albumDownloadedCount}/${tracks.length} downloaded`}
            </Text>
          )}
        </View>

        <Modal visible={showAlbumMenu} transparent animationType="fade" onRequestClose={() => setShowAlbumMenu(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowAlbumMenu(false)}>
            <View style={styles.menuSheet}>
              <Text style={styles.menuTitle} numberOfLines={1}>{album || clean}</Text>
              <TouchableOpacity style={styles.menuItem} onPress={async () => {
                setShowAlbumMenu(false);
                setFetchingMeta(true);
                const { artist: a, album: al } = cleanTorrentName(selectedAlbum!);
                const meta = await fetchMetadataFromMusicBrainz(a || al, al || a, true);
                if (meta) {
                  await setMetadataOverride(selectedAlbum!, { artist: meta.artist, album: meta.album, year: meta.year });
                  setTimeout(() => library.fetchLibrary(apiKey, true), 500);
                }
                setFetchingMeta(false);
                setArtRefreshKey(k => k + 1);
              }}>
                <Ionicons name="cloud-download-outline" size={20} color={Colors.accent} />
                <Text style={styles.menuItemText}>{fetchingMeta ? 'Fetching...' : 'Fetch Metadata'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => {
                setShowAlbumMenu(false);
                downloadAlbum(tracks);
              }}>
                <Ionicons name="arrow-down-circle-outline" size={20} color={Colors.accent} />
                <Text style={styles.menuItemText}>
                  {allAlbumDownloaded ? 'Already Downloaded' : 'Download Album'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setShowAlbumMenu(false); handlePlay(tracks[0], tracks); }}>
                <Ionicons name="play-outline" size={20} color={Colors.accent} />
                <Text style={styles.menuItemText}>Play All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={() => {
                setShowAlbumMenu(false);
                handlePlay(tracks[Math.floor(Math.random() * tracks.length)], [...tracks].sort(() => Math.random() - 0.5));
              }}>
                <Ionicons name="shuffle-outline" size={20} color={Colors.accent} />
                <Text style={styles.menuItemText}>Shuffle</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <FlatList
          data={tracks}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item, index }) => {
            const isActive = player?.state.currentTrack?.id === item.id;
            return (
              <TrackRow
                track={item} isActive={isActive} index={index}
                isPlaying={isActive && (player?.state.isPlaying ?? false)}
                onPress={() => handlePlay(item, tracks)}
                onMenu={(t) => { setMenuTrack(t); setShowPlaylistSheet(true); }}
                onDownload={(t) => {
                  if (downloadedIds.has(t.id)) {
                    Alert.alert('Remove Download', `Remove offline copy of "${t.displayName}"?`, [
                      { text: 'Remove', style: 'destructive', onPress: async () => {
                        await deleteDownload(t.id);
                        setDownloadedIds(prev => { const n = new Set(prev); n.delete(t.id); return n; });
                      }},
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  } else {
                    downloadTrack(t);
                  }
                }}
                downloadProgress={dlProgress[item.id]}
                isDownloaded={downloadedIds.has(item.id)}
              />
            );
          }}
        />
        <PlaylistSheet
          visible={showPlaylistSheet} track={menuTrack}
          onClose={() => { setShowPlaylistSheet(false); setMenuTrack(null); }}
        />
      </SafeAreaView>
    );
  }

  // ── Artist detail ──────────────────────────────────────────────────────────
  if (selectedArtist && artistMap[selectedArtist]) {
    const artistAlbums = artistMap[selectedArtist];
    const allArtistTracks = artistAlbums.flatMap(a => albumGroups[a] || []);
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.artistHeader}>
          <TouchableOpacity onPress={() => setSelectedArtist(null)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <ArtistImage artist={selectedArtist} fallbackTorrentName={artistAlbums[0]} size={120} borderRadius={60} />
          <Text style={styles.artistHeaderName}>{selectedArtist}</Text>
          <Text style={styles.artistHeaderCount}>{artistAlbums.length} albums · {allArtistTracks.length} tracks</Text>
          <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlay(allArtistTracks[0], allArtistTracks)}>
            <Ionicons name="play" size={20} color={Colors.white} />
            <Text style={styles.playAllText}>Play All</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={artistAlbums}
          keyExtractor={name => name}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item: name }) => {
            const tracks = albumGroups[name] || [];
            const { album, year } = cleanTorrentName(name);
            const isActiveAlbum = tracks.some(t => t.id === player?.state.currentTrack?.id);
            const dlCount = tracks.filter(t => downloadedIds.has(t.id)).length;
            return (
              <TouchableOpacity style={styles.albumRow} onPress={() => setSelectedAlbum(name)} activeOpacity={0.7}>
                <AlbumArt torrentName={name} size={56} borderRadius={8} />
                <View style={styles.albumRowInfo}>
                  <Text style={styles.albumRowName} numberOfLines={1}>{album || name}</Text>
                  {year ? <Text style={styles.albumRowYear}>{year}</Text> : null}
                  <Text style={styles.albumRowCount}>{tracks.length} tracks{dlCount > 0 ? ` · ${dlCount} offline` : ''}</Text>
                </View>
                {isActiveAlbum && <Ionicons name="musical-notes" size={16} color={Colors.accent} />}
                {dlCount === tracks.length && tracks.length > 0 && <Ionicons name="arrow-down-circle" size={16} color={Colors.accent} />}
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    );
  }

  // ── Playlist detail ────────────────────────────────────────────────────────
  if (selectedPlaylist) {
    const playlistTracks = selectedPlaylist.trackIds
      .map(id => allTracks.find(t => t.id === id))
      .filter(Boolean) as AudioTrack[];
    const mosaicTracks = playlistTracks.slice(0, 4);
    const coverSize = 180;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.albumHeader}>
          <View style={styles.albumHeaderRow}>
            <TouchableOpacity onPress={() => { setSelectedPlaylist(null); loadPlaylists(); }} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              Alert.alert(selectedPlaylist.name, undefined, [
                { text: 'Rename', onPress: () => { setRenameValue(selectedPlaylist.name); setShowRenameModal(true); } },
                { text: 'Change Cover', onPress: () => handlePickCover(selectedPlaylist.id) },
                { text: 'Delete Playlist', style: 'destructive', onPress: async () => {
                  await deletePlaylist(selectedPlaylist.id);
                  setSelectedPlaylist(null); loadPlaylists();
                }},
                { text: 'Cancel', style: 'cancel' },
              ]);
            }} style={styles.menuBtn}>
              <Ionicons name="ellipsis-horizontal" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => handlePickCover(selectedPlaylist.id)} activeOpacity={0.85}
            style={[styles.playlistCoverWrapper, { width: coverSize, height: coverSize }]}>
            {selectedPlaylist.coverUri ? (
              <Image source={{ uri: selectedPlaylist.coverUri }} style={{ width: coverSize, height: coverSize, borderRadius: 16 }} resizeMode="cover" />
            ) : mosaicTracks.length >= 4 ? (
              <View style={[styles.mosaicCover, { width: coverSize, height: coverSize, borderRadius: 16 }]}>
                {mosaicTracks.map((t, i) => <AlbumArt key={i} torrentName={t.torrentName} size={coverSize / 2 - 1} borderRadius={0} />)}
              </View>
            ) : mosaicTracks.length > 0 ? (
              <AlbumArt torrentName={mosaicTracks[0].torrentName} size={coverSize} borderRadius={16} />
            ) : (
              <View style={[styles.playlistCoverPlaceholder, { width: coverSize, height: coverSize }]}>
                <Ionicons name="musical-notes" size={60} color={Colors.textMuted} />
              </View>
            )}
            <View style={styles.coverEditOverlay}>
              <Ionicons name="camera-outline" size={18} color={Colors.white} />
              <Text style={styles.coverEditText}>Edit</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.albumHeaderAlbum}>{selectedPlaylist.name}</Text>
          <Text style={styles.albumHeaderYear}>{playlistTracks.length} tracks</Text>
          {playlistTracks.length > 0 && (
            <TouchableOpacity style={styles.playAllBtn} onPress={() => handlePlay(playlistTracks[0], playlistTracks)}>
              <Ionicons name="play" size={20} color={Colors.white} />
              <Text style={styles.playAllText}>Play All</Text>
            </TouchableOpacity>
          )}
        </View>

        <Modal visible={showRenameModal} transparent animationType="fade" onRequestClose={() => setShowRenameModal(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowRenameModal(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.renameSheet}>
              <Text style={styles.menuTitle}>Rename Playlist</Text>
              <TextInput style={styles.renameInput} value={renameValue} onChangeText={setRenameValue}
                autoFocus returnKeyType="done" placeholderTextColor={Colors.textMuted} />
              <TouchableOpacity style={styles.playAllBtn} onPress={async () => {
                await renamePlaylist(selectedPlaylist.id, renameValue.trim());
                setSelectedPlaylist(prev => prev ? { ...prev, name: renameValue.trim() } : prev);
                setShowRenameModal(false); loadPlaylists();
              }}>
                <Text style={styles.playAllText}>Save</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {playlistTracks.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No tracks yet</Text>
            <Text style={styles.emptyText}>Add tracks using the ··· menu on any track</Text>
          </View>
        ) : (
          <FlatList
            data={playlistTracks}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item, index }) => {
              const isActive = player?.state.currentTrack?.id === item.id;
              return (
                <TrackRow
                  track={item} isActive={isActive} index={index}
                  isPlaying={isActive && (player?.state.isPlaying ?? false)}
                  onPress={() => handlePlay(item, playlistTracks)}
                  onDownload={(t) => {
                    if (downloadedIds.has(t.id)) {
                      Alert.alert('Remove Download', `Remove offline copy of "${t.displayName}"?`, [
                        { text: 'Remove', style: 'destructive', onPress: async () => {
                          await deleteDownload(t.id);
                          setDownloadedIds(prev => { const n = new Set(prev); n.delete(t.id); return n; });
                        }},
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    } else {
                      downloadTrack(t);
                    }
                  }}
                  onMenu={() => {
                    Alert.alert('Remove Track', `Remove "${item.displayName}" from this playlist?`, [
                      { text: 'Remove', style: 'destructive', onPress: async () => {
                        await removeTrackFromPlaylist(selectedPlaylist.id, item.id);
                        setSelectedPlaylist(prev => prev
                          ? { ...prev, trackIds: prev.trackIds.filter(id => id !== item.id) }
                          : prev);
                      }},
                      { text: 'Cancel', style: 'cancel' },
                    ]);
                  }}
                  downloadProgress={dlProgress[item.id]}
                  isDownloaded={downloadedIds.has(item.id)}
                />
              );
            }}
          />
        )}
        <PlaylistSheet visible={showPlaylistSheet} track={menuTrack}
          onClose={() => { setShowPlaylistSheet(false); setMenuTrack(null); }} />
      </SafeAreaView>
    );
  }

  // ── Main library ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <Text style={styles.headerCount}>{Object.keys(albumGroups).length} albums</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/books')} style={{ padding: 4 }}>
          <Ionicons name="book-outline" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search albums or artists..."
          placeholderTextColor={Colors.textMuted}
          value={search} onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.tabs}>
        {(['home', 'albums', 'artists', 'playlists'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Home tab ── */}
      {activeTab === 'home' && (
        <ScrollView
          contentContainerStyle={styles.homeScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <SectionHeading title="Recently Added" onSeeAll={() => setActiveTab('albums')} />
          <FlatList horizontal data={recentAlbums.slice(0, HOME_SECTION_LIMIT)} keyExtractor={([name]) => name}
            showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}
            renderItem={({ item: [name, tracks] }) => {
              const isActiveAlbum = tracks.some(t => t.id === player?.state.currentTrack?.id);
              return <SmallCard torrentName={name} tracks={tracks} isActiveAlbum={isActiveAlbum} onPress={() => setSelectedAlbum(name)} />;
            }}
          />

          <SectionHeading title="Artists" onSeeAll={() => setActiveTab('artists')} />
          <FlatList horizontal data={allArtists.slice(0, HOME_SECTION_LIMIT)} keyExtractor={([name]) => name}
            showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}
            renderItem={({ item: [name, albums] }) => (
              <ArtistCard artist={name} albums={albums} onPress={() => setSelectedArtist(name)} />
            )}
          />

          <SectionHeading title="Albums" onSeeAll={() => setActiveTab('albums')} />
          <View style={styles.grid}>
            {allAlbums.slice(0, HOME_SECTION_LIMIT).map(([name, tracks]) => {
              const isActiveAlbum = tracks.some(t => t.id === player?.state.currentTrack?.id);
              const dlCount = tracks.filter(t => downloadedIds.has(t.id)).length;
              return <AlbumCard key={name} torrentName={name} tracks={tracks} isActiveAlbum={isActiveAlbum} downloadedCount={dlCount} onPress={() => setSelectedAlbum(name)} />;
            })}
          </View>

          {playlists.length > 0 && (
            <>
              <SectionHeading title="Playlists" onSeeAll={() => setActiveTab('playlists')} />
              <View style={styles.grid}>
                {playlists.slice(0, HOME_SECTION_LIMIT).map(pl => (
                  <PlaylistCard key={pl.id} playlist={pl} size={CARD_SIZE} allTracks={allTracks} onPress={() => setSelectedPlaylist(pl)} />
                ))}
              </View>
            </>
          )}

          {downloadedTrackList.length > 0 && (
            <>
              <SectionHeading title="Downloaded" onSeeAll={() => {}} />
              <FlatList horizontal data={downloadedTrackList.slice(0, HOME_SECTION_LIMIT)} keyExtractor={t => t.id}
                showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}
                renderItem={({ item: t }) => {
                  const isActive = player?.state.currentTrack?.id === t.id;
                  return (
                    <TouchableOpacity style={styles.smallCard} onPress={() => handlePlay(t, downloadedTrackList)} activeOpacity={0.8}>
                      <AlbumArt torrentName={t.torrentName} size={SMALL_CARD} borderRadius={10} />
                      <Text style={styles.smallCardAlbum} numberOfLines={1}>{t.displayName}</Text>
                      <Text style={styles.smallCardArtist} numberOfLines={1}>{t.artist}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </>
          )}
        </ScrollView>
      )}

      {/* ── Albums tab ── */}
      {activeTab === 'albums' && (
        <FlatList data={allAlbums} keyExtractor={([name]) => name} numColumns={2}
          columnWrapperStyle={styles.row} contentContainerStyle={styles.gridScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          renderItem={({ item: [name, tracks] }) => {
            const isActiveAlbum = tracks.some(t => t.id === player?.state.currentTrack?.id);
            const dlCount = tracks.filter(t => downloadedIds.has(t.id)).length;
            return <AlbumCard torrentName={name} tracks={tracks} isActiveAlbum={isActiveAlbum} downloadedCount={dlCount} onPress={() => setSelectedAlbum(name)} />;
          }}
        />
      )}

      {/* ── Artists tab ── */}
      {activeTab === 'artists' && (
        <FlatList data={allArtists} keyExtractor={([name]) => name}
          contentContainerStyle={styles.artistList}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          renderItem={({ item: [name, albums] }) => (
            <TouchableOpacity style={styles.artistListRow} onPress={() => setSelectedArtist(name)} activeOpacity={0.7}>
              <ArtistImage artist={name} fallbackTorrentName={albums[0]} size={52} borderRadius={26} />
              <View style={styles.artistListInfo}>
                <Text style={styles.artistListName}>{name}</Text>
                <Text style={styles.artistListCount}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Playlists tab ── */}
      {activeTab === 'playlists' && (
        <FlatList data={playlists} keyExtractor={p => p.id} numColumns={2}
          columnWrapperStyle={styles.row} contentContainerStyle={styles.gridScroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          ListHeaderComponent={
            <TouchableOpacity style={styles.newPlaylistRow} onPress={async () => {
              Alert.prompt('New Playlist', 'Enter a name', async (name) => {
                if (name?.trim()) { await createPlaylist(name.trim()); loadPlaylists(); }
              });
            }}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.accent} />
              <Text style={styles.newPlaylistRowText}>New Playlist</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No playlists yet</Text>
              <Text style={styles.emptyText}>Tap New Playlist to get started</Text>
            </View>
          }
          renderItem={({ item: pl }) => (
            <PlaylistCard playlist={pl} size={CARD_SIZE} allTracks={allTracks} onPress={() => setSelectedPlaylist(pl)} />
          )}
        />
      )}

      <PlaylistSheet visible={showPlaylistSheet} track={menuTrack}
        onClose={() => { setShowPlaylistSheet(false); setMenuTrack(null); loadPlaylists(); }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 8,
  },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800' },
  headerCount: { color: Colors.textMuted, fontSize: 13 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
    marginBottom: 10, backgroundColor: Colors.surfaceElevated,
    borderRadius: 10, paddingHorizontal: 10, height: 38,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: Colors.white },
  homeScroll: { paddingBottom: 120 },
  sectionHeadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12, marginTop: 8,
  },
  sectionHeading: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  seeAll: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  hScroll: { paddingHorizontal: 16, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 16 },
  gridScroll: { paddingHorizontal: 16, paddingBottom: 120 },
  row: { justifyContent: 'space-between', marginBottom: 20 },
  card: { width: CARD_SIZE },
  cardArtContainer: { width: CARD_SIZE, height: CARD_SIZE, marginBottom: 8, position: 'relative' },
  smallCard: { width: SMALL_CARD },
  smallCardAlbum: { color: Colors.text, fontSize: 12, fontWeight: '600', marginTop: 6 },
  smallCardArtist: { color: Colors.textSecondary, fontSize: 11, marginTop: 1 },
  artistCard: { width: SMALL_CARD, alignItems: 'center' },
  artistName: { color: Colors.text, fontSize: 12, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  artistCount: { color: Colors.textMuted, fontSize: 11, marginTop: 1, textAlign: 'center' },
  playingBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: Colors.accent, borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  yearBadge: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, zIndex: 1,
  },
  yearText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  downloadedBadge: {
    position: 'absolute', top: 8, left: 8,
    backgroundColor: Colors.accent, borderRadius: 12,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  downloadedBadgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  cardAlbum: { color: Colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardArtist: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  cardCount: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  albumHeader: {
    padding: 20, paddingTop: 8, alignItems: 'center',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  artistHeader: {
    padding: 20, paddingTop: 8, alignItems: 'center',
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  albumHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', width: '100%', paddingHorizontal: 4, marginBottom: 16,
  },
  albumHeaderActions: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  downloadAlbumBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.accent, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  downloadAlbumText: { color: Colors.accent, fontWeight: '700', fontSize: 15 },
  downloadedCount: { color: Colors.textMuted, fontSize: 12, marginTop: 6 },
  menuBtn: { padding: 8 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#1c1c2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40, gap: 4,
  },
  menuTitle: { color: Colors.textMuted, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  menuItemText: { color: Colors.white, fontSize: 16 },
  backBtn: { alignSelf: 'flex-start', padding: 4, marginBottom: 12 },
  albumHeaderAlbum: { color: Colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12, marginBottom: 2 },
  albumHeaderArtist: { color: Colors.textSecondary, fontSize: 15, marginBottom: 2 },
  albumHeaderYear: { color: Colors.textMuted, fontSize: 12, marginBottom: 16 },
  artistHeaderName: { color: Colors.text, fontSize: 24, fontWeight: '800', marginTop: 12, marginBottom: 2 },
  artistHeaderCount: { color: Colors.textSecondary, fontSize: 13, marginBottom: 16 },
  playAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 24,
    paddingHorizontal: 24, paddingVertical: 10, marginTop: 8,
  },
  playAllText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  albumRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  albumRowInfo: { flex: 1 },
  albumRowName: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  albumRowYear: { color: Colors.textSecondary, fontSize: 12, marginTop: 1 },
  albumRowCount: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  artistList: { paddingBottom: 120 },
  artistListRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  artistListInfo: { flex: 1 },
  artistListName: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  artistListCount: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  newPlaylistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  newPlaylistRowText: { color: Colors.accent, fontSize: 15, fontWeight: '600' },
  playlistCoverWrapper: { position: 'relative', marginBottom: 4 },
  mosaicCover: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, overflow: 'hidden' },
  playlistCoverPlaceholder: { backgroundColor: Colors.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  coverEditOverlay: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  coverEditText: { color: Colors.white, fontSize: 11, fontWeight: '600' },
  renameSheet: {
    backgroundColor: '#1c1c2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 48, gap: 16,
  },
  renameInput: {
    color: Colors.text, fontSize: 16, backgroundColor: Colors.surface,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 8, backgroundColor: Colors.accent, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
});
