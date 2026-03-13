import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { AudioTrack, getStreamUrl, getStoredApiKey, formatDuration } from '../services/torbox';
import { getWebDAVCredentials } from '../services/webdav';

export interface PlayerState {
  currentTrack: AudioTrack | null;
  queue: AudioTrack[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  isBuffering: boolean;
  loadingProgress: number;
  position: number;
  duration: number;
  positionDisplay: string;
  durationDisplay: string;
  progress: number;
  error: string | null;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
  streamMode: 'webdav' | 'download';
}

const initialState: PlayerState = {
  currentTrack: null, queue: [], queueIndex: -1,
  isPlaying: false, isLoading: false, isBuffering: false,
  loadingProgress: 0, position: 0, duration: 0,
  positionDisplay: '0:00', durationDisplay: '0:00',
  progress: 0, error: null, shuffle: false, repeat: 'none',
  streamMode: 'download',
};

// Suppress known harmless expo-av streaming errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0]?.toString() || '';
  if (msg.includes('Seeking interrupted')) return;
  originalConsoleError(...args);
};

export function usePlayer() {
  const [state, setState] = useState<PlayerState>(initialState);
  const soundRef = useRef<Audio.Sound | null>(null);
  const downloadResumable = useRef<FileSystem.DownloadResumable | null>(null);
  const preloadedRef = useRef<{ sound: Audio.Sound; trackId: string } | null>(null);
  const loadingIdRef = useRef<string | null>(null);
  const stateRef = useRef<PlayerState>(initialState);
  const callbackRef = useRef<(status: AVPlaybackStatus) => void>();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep stateRef in sync
  const updateState = useCallback((updates: Partial<PlayerState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      stateRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    return () => {
      soundRef.current?.unloadAsync();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Stable callback that never changes reference
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      const err = (status as any).error;
      if (err && !err.includes('Seeking interrupted')) {
        updateState({ error: `Playback error: ${err}`, isLoading: false });
      }
      return;
    }
    const position = status.positionMillis || 0;
    const duration = status.durationMillis || 0;
    // Don't override isPlaying from status — we manage it manually
    // AVFoundation reports isPlaying: false even when streaming
    updateState({
      isBuffering: status.isBuffering,
      isLoading: false,
      position, duration,
      positionDisplay: formatDuration(position),
      durationDisplay: formatDuration(duration),
      progress: duration > 0 ? position / duration : 0,
      error: null,
    });

    if (status.didJustFinish) {
      const { repeat, queueIndex, queue, shuffle } = stateRef.current;
      if (repeat === 'one') {
        playTrackAtIndex(queueIndex, queue);
      } else if (queueIndex < queue.length - 1) {
        playTrackAtIndex(shuffle ? Math.floor(Math.random() * queue.length) : queueIndex + 1, queue);
      } else if (repeat === 'all') {
        playTrackAtIndex(0, queue);
      }
    }
  }, [updateState]);

  // Keep ref pointing to latest callback
  callbackRef.current = onPlaybackStatusUpdate;

  // Stable wrapper that never changes
  const stableCallback = useRef((status: AVPlaybackStatus) => {
    callbackRef.current?.(status);
  }).current;

  // Poll position every 500ms for smooth progress bar
  const playStartTimeRef = useRef<{ wallTime: number; trackPosition: number } | null>(null);
  const isDraggingRef = useRef(false);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (isDraggingRef.current) return;
      if (!playStartTimeRef.current) {
        setState(prev => ({ ...prev, position: 0, progress: 0, positionDisplay: '0:00' }));
        return;
      }
      setState(prev => {
        if (!prev.isPlaying) return prev;
        const elapsed = Date.now() - playStartTimeRef.current!.wallTime;
        const position = Math.min(
          playStartTimeRef.current!.trackPosition + elapsed,
          prev.duration || 999999
        );
        // Fallback: if position reached duration, advance to next track
        if (prev.duration > 0 && position >= prev.duration - 800) {
          const { repeat, queueIndex, queue, shuffle } = stateRef.current;
          if (repeat === 'one') {
            setTimeout(() => playTrackAtIndex(queueIndex, queue), 100);
          } else if (queueIndex < queue.length - 1) {
            setTimeout(() => playTrackAtIndex(shuffle ? Math.floor(Math.random() * queue.length) : queueIndex + 1, queue), 100);
          } else if (repeat === 'all') {
            setTimeout(() => playTrackAtIndex(0, queue), 100);
          }
          playStartTimeRef.current = null;
        }
        return {
          ...prev,
          position,
          positionDisplay: formatDuration(position),
          progress: prev.duration > 0 ? position / prev.duration : 0,
        };
      });
    }, 500);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const playTrackAtIndex = useCallback(async (index: number, queue: AudioTrack[]) => {
    const track = queue[index];
    if (!track) return;

    const loadId = `${track.id}-${Date.now()}`;
    loadingIdRef.current = loadId;

    playStartTimeRef.current = null;
    updateState({ isLoading: true, isPlaying: false, loadingProgress: 0, position: 0, duration: 0, progress: 0, positionDisplay: '0:00', durationDisplay: '0:00', error: null, currentTrack: track, queueIndex: index });

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (loadingIdRef.current !== loadId) return;

      // Use preloaded sound if available
      if (preloadedRef.current?.trackId === track.id) {
        console.log('Using preloaded:', track.displayName);
        const { sound } = preloadedRef.current;
        preloadedRef.current = null;
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(stableCallback);
        await sound.playAsync();
        updateState({ isLoading: false, isPlaying: true, queue, queueIndex: index });
        return;
      }

      // Use local file if available (offline playback)
      if (track.streamUrl && track.streamUrl.startsWith('file://')) {
        try {
          console.log('Playing from local file:', track.displayName);
          const { sound } = await Audio.Sound.createAsync(
            { uri: track.streamUrl },
            { shouldPlay: true, progressUpdateIntervalMillis: 100 },
            stableCallback
          );
          if (loadingIdRef.current !== loadId) { await sound.unloadAsync(); return; }
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate(stableCallback);
          playStartTimeRef.current = { wallTime: Date.now(), trackPosition: 0 };
          updateState({ isLoading: false, isPlaying: true, position: 0, progress: 0, queue, queueIndex: index });
          startPolling();
          return;
        } catch (e: any) {
          console.log('Local file failed:', e.message);
        }
      }
      // Try WebDAV
      const webdavCreds = await getWebDAVCredentials();
      if (webdavCreds) {
        try {
          updateState({ streamMode: 'webdav' });
          const fileName = track.name.split('/').pop() || track.name;
          const encodedFile = encodeURIComponent(fileName);
          const encodedEmail = encodeURIComponent(webdavCreds.email);
          const encodedPassword = encodeURIComponent(webdavCreds.password);
          const webdavUrl = `https://${encodedEmail}:${encodedPassword}@webdav.torbox.app/${encodedFile}`;
          console.log('Streaming via WebDAV:', track.displayName);

          const { sound } = await Audio.Sound.createAsync(
            { uri: webdavUrl },
            { shouldPlay: true, progressUpdateIntervalMillis: 100 },
            stableCallback
          );

          if (loadingIdRef.current !== loadId) { await sound.unloadAsync(); return; }

          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate(stableCallback);
          playStartTimeRef.current = { wallTime: Date.now(), trackPosition: 0 };
          updateState({ isLoading: false, isPlaying: true, position: 0, progress: 0, queue, queueIndex: index });
          startPolling();

          // Preload next
          const nextIndex = index + 1;
          if (nextIndex < queue.length) {
            const nextTrack = queue[nextIndex];
            setTimeout(async () => {
              try {
                if (preloadedRef.current) { await preloadedRef.current.sound.unloadAsync(); }
                const nextFile = encodeURIComponent(nextTrack.name.split('/').pop() || nextTrack.name);
                const nextUrl = `https://${encodedEmail}:${encodedPassword}@webdav.torbox.app/${nextFile}`;
                const { sound: pre } = await Audio.Sound.createAsync({ uri: nextUrl }, { shouldPlay: false });
                preloadedRef.current = { sound: pre, trackId: nextTrack.id };
                console.log('Preloaded:', nextTrack.displayName);
              } catch {}
            }, 3000);
          }
          return;
        } catch (e: any) {
          console.log('WebDAV failed, falling back:', e.message);
        }
      }

      // Fallback: download
      updateState({ streamMode: 'download' });
      const apiKey = await getStoredApiKey();
      if (!apiKey) throw new Error('No API key set');

      const url = await getStreamUrl(apiKey, track.torrentId, track.fileId);
      const ext = track.extension || '.flac';
      const tempUri = FileSystem.cacheDirectory + `velvt_${track.fileId}${ext}`;
      const fileInfo = await FileSystem.getInfoAsync(tempUri);
      let localUri = tempUri;

      if (!fileInfo.exists) {
        const download = FileSystem.createDownloadResumable(url, tempUri, {}, (progress) => {
          updateState({ loadingProgress: progress.totalBytesWritten / progress.totalBytesExpectedToWrite });
        });
        downloadResumable.current = download;
        const result = await download.downloadAsync();
        if (!result) throw new Error('Download failed');
        localUri = result.uri;
      }

      if (loadingIdRef.current !== loadId) return;

      const { sound } = await Audio.Sound.createAsync(
        { uri: localUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
        stableCallback
      );

      if (loadingIdRef.current !== loadId) { await sound.unloadAsync(); return; }

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(stableCallback);
      playStartTimeRef.current = { wallTime: Date.now(), trackPosition: 0 };
      updateState({ isLoading: false, isPlaying: true, position: 0, progress: 0, loadingProgress: 0, queue, queueIndex: index });
      startPolling();

    } catch (err: any) {
      console.log('Play error:', err.message);
      updateState({ isLoading: false, loadingProgress: 0, error: err.message });
    }
  }, [onPlaybackStatusUpdate, updateState]);

  const play = useCallback(async (track: AudioTrack, queue: AudioTrack[] = [track]) => {
    const index = queue.findIndex(t => t.id === track.id);
    await playTrackAtIndex(index >= 0 ? index : 0, queue);
  }, [playTrackAtIndex]);

  const pause = useCallback(async () => {
    await soundRef.current?.pauseAsync();
    // Capture position at pause time
    if (playStartTimeRef.current) {
      const elapsed = Date.now() - playStartTimeRef.current.wallTime;
      playStartTimeRef.current = { wallTime: Date.now(), trackPosition: playStartTimeRef.current.trackPosition + elapsed };
    }
    updateState({ isPlaying: false });
  }, [updateState]);

  const resume = useCallback(async () => {
    await soundRef.current?.playAsync();
    // Reset wall time on resume, keep track position
    if (playStartTimeRef.current) {
      playStartTimeRef.current = { wallTime: Date.now(), trackPosition: playStartTimeRef.current.trackPosition };
    }
    updateState({ isPlaying: true });
  }, [updateState]);

  const togglePlay = useCallback(async () => {
    if (stateRef.current.isPlaying) {
      await soundRef.current?.pauseAsync();
      updateState({ isPlaying: false });
    } else {
      await soundRef.current?.playAsync();
      updateState({ isPlaying: true });
    }
  }, [updateState]);

  const seekTo = useCallback(async (positionMs: number) => {
    await soundRef.current?.setPositionAsync(positionMs);
    playStartTimeRef.current = { wallTime: Date.now(), trackPosition: positionMs };
    // Immediately save resume position if this is an audiobook
    const current = stateRef.current.currentTrack;
    if (current?.mediaType === 'audiobook' && positionMs > 30000) {
      const { saveResumePosition } = require('../services/audiobooks');
      saveResumePosition(current.torrentName, current.id, positionMs);
    }
  }, []);

  const seekByProgress = useCallback(async (progress: number) => {
    const dur = stateRef.current.duration;
    if (dur > 0) await seekTo(progress * dur);
  }, [seekTo]);

  const skipNext = useCallback(async () => {
    const { queueIndex, queue, shuffle, repeat } = stateRef.current;
    if (!queue.length) return;
    let next: number;
    if (shuffle) next = Math.floor(Math.random() * queue.length);
    else if (queueIndex < queue.length - 1) next = queueIndex + 1;
    else if (repeat === 'all') next = 0;
    else return;
    await playTrackAtIndex(next, queue);
  }, [playTrackAtIndex]);

  const skipPrev = useCallback(async () => {
    const { queueIndex, queue, position } = stateRef.current;
    if (position > 3000) { await seekTo(0); return; }
    if (queueIndex > 0) await playTrackAtIndex(queueIndex - 1, queue);
  }, [playTrackAtIndex, seekTo]);

  const toggleShuffle = useCallback(() => {
    updateState({ shuffle: !stateRef.current.shuffle });
  }, [updateState]);

  const toggleRepeat = useCallback(() => {
    const next = stateRef.current.repeat === 'none' ? 'all' : stateRef.current.repeat === 'all' ? 'one' : 'none';
    updateState({ repeat: next });
  }, [updateState]);

  const setDragging = useCallback((val: boolean) => {
    isDraggingRef.current = val;
  }, []);

  return {
    state, play, pause, resume, togglePlay,
    seekTo, seekByProgress, skipNext, skipPrev,
    toggleShuffle, toggleRepeat, setDragging,
  };
}
