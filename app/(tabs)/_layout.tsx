import React, { useState } from 'react';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { usePlayer } from '../../hooks/usePlayer';
import { MiniPlayer } from '../../components/MiniPlayer';
import { NowPlayingModal } from '../../components/NowPlayingModal';

let globalPlayerRef: ReturnType<typeof usePlayer> | null = null;
export function getPlayer() { return globalPlayerRef; }

import { useState as useReactState, useEffect as useReactEffect } from 'react';
export function useGlobalPlayer() {
  const [, forceUpdate] = useReactState(0);
  useReactEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 100);
    return () => clearInterval(interval);
  }, []);
  return globalPlayerRef;
}

let resetLibraryScreen: (() => void) | null = null;
export function registerLibraryReset(fn: () => void) { resetLibraryScreen = fn; }
export function clearLibraryReset() { resetLibraryScreen = null; }

export default function TabLayout() {
  const player = usePlayer();
  globalPlayerRef = player;
  const [showModal, setShowModal] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingBottom: 8,
            paddingTop: 4,
            height: 56,
          },
          tabBarActiveTintColor: Colors.accent,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="musical-notes" size={size} color={color} />
            ),
          }}
          listeners={{ tabPress: () => { resetLibraryScreen?.(); } }}
        />
        <Tabs.Screen
          name="recent"
          options={{
            title: 'Recent',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="books"
          options={{
            title: 'Books',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="book-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="downloads"
          options={{
            title: 'Downloads',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="arrow-down-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{ href: null }}
        />
      </Tabs>

      {player.state.currentTrack && (
        <MiniPlayer
          state={player.state}
          onTogglePlay={player.togglePlay}
          onSkipNext={player.skipNext}
          onPress={() => setShowModal(true)}
        />
      )}
      <NowPlayingModal
        visible={showModal}
        state={{ ...player.state }}
        onClose={() => setShowModal(false)}
        onTogglePlay={player.togglePlay}
        onSkipNext={player.skipNext}
        onSkipPrev={player.skipPrev}
        onSeek={player.seekByProgress}
        onToggleShuffle={player.toggleShuffle}
        onToggleRepeat={player.toggleRepeat}
        onDragStart={() => player.setDragging(true)}
        onDragEnd={() => player.setDragging(false)}
      />
    </View>
  );
}
