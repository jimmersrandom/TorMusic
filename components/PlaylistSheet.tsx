import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  FlatList, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import {
  getPlaylists, createPlaylist, addTrackToPlaylist,
  invalidateCache, Playlist,
} from '../services/playlists';
import { AudioTrack } from '../services/torbox';

interface Props {
  visible: boolean;
  track: AudioTrack | null;
  onClose: () => void;
}

export function PlaylistSheet({ visible, track, onClose }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      invalidateCache();
      getPlaylists().then(setPlaylists);
      setCreating(false);
      setNewName('');
      setAdded(null);
    }
  }, [visible]);

  const handleAdd = async (playlist: Playlist) => {
    if (!track) return;
    await addTrackToPlaylist(playlist.id, track.id);
    setAdded(playlist.id);
    setTimeout(onClose, 600);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const pl = await createPlaylist(name);
    if (track) {
      await addTrackToPlaylist(pl.id, track.id);
      setAdded(pl.id);
      setTimeout(onClose, 600);
    } else {
      invalidateCache();
      getPlaylists().then(setPlaylists);
      setCreating(false);
      setNewName('');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={1}>
            {track ? `Add "${track.displayName}"` : 'Playlists'}
          </Text>

          {/* Create new */}
          {creating ? (
            <View style={styles.createRow}>
              <TextInput
                style={styles.input}
                placeholder="Playlist name..."
                placeholderTextColor={Colors.textMuted}
                value={newName}
                onChangeText={setNewName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
              />
              <TouchableOpacity onPress={handleCreate} style={styles.createConfirm}>
                <Ionicons name="checkmark" size={20} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCreating(false); setNewName(''); }} style={styles.createCancel}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.newPlaylistBtn} onPress={() => setCreating(true)}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
              <Text style={styles.newPlaylistText}>New Playlist</Text>
            </TouchableOpacity>
          )}

          {playlists.length === 0 ? (
            <Text style={styles.empty}>No playlists yet</Text>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={p => p.id}
              style={styles.list}
              renderItem={({ item }) => {
                const isDone = added === item.id;
                return (
                  <TouchableOpacity
                    style={styles.playlistRow}
                    onPress={() => handleAdd(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.playlistIcon}>
                      <Ionicons name="musical-notes" size={18} color={Colors.accent} />
                    </View>
                    <View style={styles.playlistInfo}>
                      <Text style={styles.playlistName}>{item.name}</Text>
                      <Text style={styles.playlistCount}>{item.trackIds.length} tracks</Text>
                    </View>
                    {isDone && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} />}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1c1c2e',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 48, paddingTop: 12,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: 16,
  },
  title: {
    color: Colors.textMuted, fontSize: 12, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16,
  },
  newPlaylistBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  newPlaylistText: { color: Colors.accent, fontSize: 15, fontWeight: '600' },
  createRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  input: {
    flex: 1, color: Colors.text, fontSize: 15,
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  createConfirm: {
    backgroundColor: Colors.accent, borderRadius: 8,
    padding: 8,
  },
  createCancel: { padding: 8 },
  list: { marginTop: 4 },
  playlistRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  playlistIcon: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  playlistInfo: { flex: 1 },
  playlistName: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  playlistCount: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  empty: { color: Colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 32 },
});
