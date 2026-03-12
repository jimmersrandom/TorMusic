import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '../../constants/colors';
import { getStoredApiKey, storeApiKey, clearApiKey, fetchTorrents, formatFileSize } from '../../services/torbox';
import {
  getWebDAVCredentials, saveWebDAVCredentials,
  clearWebDAVCredentials, testWebDAVConnection
} from '../../services/webdav';

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  const [webdavEmail, setWebdavEmail] = useState('');
  const [webdavPassword, setWebdavPassword] = useState('');
  const [webdavSaved, setWebdavSaved] = useState(false);
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavResult, setWebdavResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showWebdavPassword, setShowWebdavPassword] = useState(false);

  const [cacheSize, setCacheSize] = useState<number>(0);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    getStoredApiKey().then(key => {
      setSavedKey(key);
      if (key) setApiKey(key);
    });
    getWebDAVCredentials().then(creds => {
      if (creds) {
        setWebdavEmail(creds.email);
        setWebdavPassword(creds.password);
        setWebdavSaved(true);
      }
    });
    calculateCacheSize();
  }, []);

  const calculateCacheSize = async () => {
    try {
      const cacheDir = FileSystem.cacheDirectory || '';
      const files = await FileSystem.readDirectoryAsync(cacheDir);
      const audioFiles = files.filter(f => f.startsWith('velvt_'));
      let total = 0;
      for (const file of audioFiles) {
        const info = await FileSystem.getInfoAsync(cacheDir + file);
        if (info.exists) total += (info as any).size || 0;
      }
      setCacheSize(total);
    } catch {}
  };

  const handleClearCache = async () => {
    Alert.alert('Clear Cache', 'Delete all cached audio files?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear', style: 'destructive',
        onPress: async () => {
          setClearingCache(true);
          try {
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory || '');
            const audioFiles = files.filter(f => f.startsWith('velvt_'));
            await Promise.all(audioFiles.map(f =>
              FileSystem.deleteAsync((FileSystem.cacheDirectory || '') + f, { idempotent: true })
            ));
            setCacheSize(0);
            Alert.alert('Done', `Cleared ${audioFiles.length} cached files.`);
          } catch {
            Alert.alert('Error', 'Failed to clear cache.');
          } finally {
            setClearingCache(false);
          }
        },
      },
    ]);
  };

  const handleSaveApiKey = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) { Alert.alert('Error', 'Please enter an API key'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      await fetchTorrents(trimmed);
      await storeApiKey(trimmed);
      setSavedKey(trimmed);
      setTestResult({ ok: true, message: 'Connected successfully!' });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Failed to connect.' });
    } finally {
      setTesting(false);
    }
  };

  const handleClearApiKey = () => {
    Alert.alert('Remove API Key', 'This will disconnect your Torbox account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await clearApiKey();
          setSavedKey(null);
          setApiKey('');
          setTestResult(null);
        },
      },
    ]);
  };

  const handleSaveWebDAV = async () => {
    if (!webdavEmail.trim() || !webdavPassword.trim()) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }
    setWebdavTesting(true);
    setWebdavResult(null);
    try {
      const creds = { email: webdavEmail.trim(), password: webdavPassword.trim() };
      const ok = await testWebDAVConnection(creds);
      if (ok) {
        await saveWebDAVCredentials(creds.email, creds.password);
        setWebdavSaved(true);
        setWebdavResult({ ok: true, message: 'WebDAV connected! FLAC files will now stream instantly.' });
      } else {
        setWebdavResult({ ok: false, message: 'Could not connect. Check your email and password.' });
      }
    } catch (err: any) {
      setWebdavResult({ ok: false, message: err.message || 'Connection failed.' });
    } finally {
      setWebdavTesting(false);
    }
  };

  const handleClearWebDAV = () => {
    Alert.alert('Remove WebDAV', 'This will disable instant streaming.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await clearWebDAVCredentials();
          setWebdavEmail('');
          setWebdavPassword('');
          setWebdavSaved(false);
          setWebdavResult(null);
        },
      },
    ]);
  };

  const maskedKey = savedKey
    ? `${savedKey.slice(0, 8)}${'•'.repeat(Math.max(0, savedKey.length - 12))}${savedKey.slice(-4)}`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.headerTitle}>Settings</Text>

        {/* WebDAV Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>WEBDAV STREAMING</Text>
            <View style={[styles.badge, webdavSaved ? styles.badgeOn : styles.badgeOff]}>
              <Text style={styles.badgeText}>{webdavSaved ? 'ON' : 'OFF'}</Text>
            </View>
          </View>

          {webdavSaved && (
            <View style={styles.connectedBadge}>
              <Ionicons name="flash" size={16} color="#4ec9b0" />
              <Text style={styles.connectedText}>Instant streaming enabled</Text>
            </View>
          )}

          <Text style={styles.helpText}>
            Connect with your Torbox email & password for instant FLAC streaming — no downloading required.
            Make sure <Text style={styles.bold}>WebDAV Flattening</Text> is enabled in your Torbox settings.
          </Text>

          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={16} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={webdavEmail}
              onChangeText={setWebdavEmail}
              placeholder="Torbox email..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={16} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={webdavPassword}
              onChangeText={setWebdavPassword}
              placeholder="Torbox password..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showWebdavPassword}
            />
            <TouchableOpacity onPress={() => setShowWebdavPassword(!showWebdavPassword)} style={styles.eyeBtn}>
              <Ionicons name={showWebdavPassword ? 'eye-off' : 'eye'} size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {webdavResult && (
            <View style={[styles.result, webdavResult.ok ? styles.resultOk : styles.resultErr]}>
              <Ionicons
                name={webdavResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={webdavResult.ok ? '#4ec9b0' : Colors.accent}
              />
              <Text style={[styles.resultText, webdavResult.ok ? styles.resultOkText : styles.resultErrText]}>
                {webdavResult.message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, webdavTesting && styles.saveBtnDisabled]}
            onPress={handleSaveWebDAV}
            disabled={webdavTesting}
          >
            {webdavTesting ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="flash" size={16} color={Colors.white} />
                <Text style={styles.saveBtnText}>{webdavSaved ? 'Update WebDAV' : 'Enable Instant Streaming'}</Text>
              </>
            )}
          </TouchableOpacity>

          {webdavSaved && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearWebDAV}>
              <Ionicons name="trash-outline" size={16} color={Colors.accent} />
              <Text style={styles.clearBtnText}>Remove WebDAV</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* API Key Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TORBOX API KEY</Text>
          <Text style={styles.helpText}>Required for browsing your library. WebDAV handles the actual streaming so tracks play instantly.</Text>

          {savedKey && (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#4ec9b0" />
              <Text style={styles.connectedText}>Connected</Text>
              <Text style={styles.maskedKey}>{maskedKey}</Text>
            </View>
          )}

          <View style={styles.inputRow}>
            <Ionicons name="key-outline" size={16} color={Colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="Paste your Torbox API key..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showKey}
            />
            <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeBtn}>
              <Ionicons name={showKey ? 'eye-off' : 'eye'} size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {testResult && (
            <View style={[styles.result, testResult.ok ? styles.resultOk : styles.resultErr]}>
              <Ionicons
                name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={testResult.ok ? '#4ec9b0' : Colors.accent}
              />
              <Text style={[styles.resultText, testResult.ok ? styles.resultOkText : styles.resultErrText]}>
                {testResult.message}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, testing && styles.saveBtnDisabled]}
            onPress={handleSaveApiKey}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{savedKey ? 'Update & Test' : 'Save & Connect'}</Text>
            )}
          </TouchableOpacity>

          {savedKey && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClearApiKey}>
              <Ionicons name="trash-outline" size={16} color={Colors.accent} />
              <Text style={styles.clearBtnText}>Remove API Key</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Cache Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIO CACHE</Text>
          <View style={styles.cacheRow}>
            <View>
              <Text style={styles.cacheLabel}>Cached audio files</Text>
              <Text style={styles.cacheSize}>{cacheSize > 0 ? formatFileSize(cacheSize) : 'Empty'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.clearCacheBtn, (clearingCache || cacheSize === 0) && styles.clearCacheBtnDisabled]}
              onPress={handleClearCache}
              disabled={clearingCache || cacheSize === 0}
            >
              {clearingCache ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color={Colors.white} />
                  <Text style={styles.clearCacheBtnText}>Clear</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.cacheNote}>
            Used when WebDAV is not enabled. Tracks cache for faster replay.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={calculateCacheSize}>
            <Ionicons name="refresh" size={14} color={Colors.accent} />
            <Text style={styles.refreshText}>Refresh size</Text>
          </TouchableOpacity>
        </View>

        {/* Formats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORTED FORMATS</Text>
          <View style={styles.formats}>
            {[
              { ext: 'FLAC', color: '#4ec9b0', note: 'Lossless' },
              { ext: 'MP3', color: '#9b9b9b', note: 'Lossy' },
              { ext: 'AAC', color: '#569cd6', note: 'Lossy' },
              { ext: 'M4A', color: '#569cd6', note: 'Lossy' },
              { ext: 'WAV', color: '#dcdcaa', note: 'Lossless' },
              { ext: 'OGG', color: '#c586c0', note: 'Lossy' },
              { ext: 'OPUS', color: '#c586c0', note: 'Lossy' },
              { ext: 'ALAC', color: '#4ec9b0', note: 'Lossless' },
              { ext: 'AIFF', color: '#dcdcaa', note: 'Lossless' },
            ].map(f => (
              <View key={f.ext} style={styles.formatChip}>
                <Text style={[styles.formatExt, { color: f.color }]}>{f.ext}</Text>
                <Text style={styles.formatNote}>{f.note}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Velvt v1.0.0</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://torbox.app')}>
            <Text style={[styles.footerText, { color: Colors.accent }]}>torbox.app ↗</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  headerTitle: { color: Colors.text, fontSize: 28, fontWeight: '800', marginBottom: 24 },
  section: {
    backgroundColor: Colors.surface, borderRadius: 14,
    padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeOn: { backgroundColor: 'rgba(78,201,176,0.2)' },
  badgeOff: { backgroundColor: Colors.surfaceElevated },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.textSecondary },
  helpText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  bold: { fontWeight: '700', color: Colors.text },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(78, 201, 176, 0.1)', borderRadius: 8,
    padding: 10, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(78, 201, 176, 0.3)',
  },
  connectedText: { color: '#4ec9b0', fontWeight: '600', fontSize: 13 },
  maskedKey: { color: Colors.textMuted, fontSize: 12, marginLeft: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceElevated, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, color: Colors.text, fontSize: 14, padding: 13 },
  eyeBtn: { padding: 12 },
  result: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  resultOk: { backgroundColor: 'rgba(78, 201, 176, 0.1)', borderWidth: 1, borderColor: 'rgba(78, 201, 176, 0.3)' },
  resultErr: { backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: 'rgba(255, 107, 53, 0.3)' },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18 },
  resultOkText: { color: '#4ec9b0' },
  resultErrText: { color: Colors.accent },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 10, paddingVertical: 13,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 10, paddingVertical: 8,
  },
  clearBtnText: { color: Colors.accent, fontSize: 14 },
  cacheRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cacheLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  cacheSize: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  clearCacheBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8,
  },
  clearCacheBtnDisabled: { opacity: 0.4 },
  clearCacheBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  cacheNote: { color: Colors.textMuted, fontSize: 12, lineHeight: 18 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  refreshText: { color: Colors.accent, fontSize: 12 },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatChip: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  formatExt: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  formatNote: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  footer: { alignItems: 'center', marginTop: 8, gap: 4 },
  footerText: { color: Colors.textMuted, fontSize: 12 },
});
