import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, ActivityIndicator, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { getStoredApiKey, storeApiKey, clearApiKey, fetchTorrents } from '../../services/torbox';

export default function SettingsScreen() {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    getStoredApiKey().then(key => {
      setSavedKey(key);
      if (key) setApiKey(key);
    });
  }, []);

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      await fetchTorrents(trimmed);
      await storeApiKey(trimmed);
      setSavedKey(trimmed);
      setTestResult({ ok: true, message: 'Connected successfully! Your library will load shortly.' });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Failed to connect. Check your API key.' });
    } finally {
      setTesting(false);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Remove API Key',
      'This will disconnect your Torbox account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await clearApiKey();
            setSavedKey(null);
            setApiKey('');
            setTestResult(null);
          },
        },
      ]
    );
  };

  const maskedKey = savedKey
    ? `${savedKey.slice(0, 8)}${'•'.repeat(Math.max(0, savedKey.length - 12))}${savedKey.slice(-4)}`
    : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.headerTitle}>Settings</Text>

        {/* API Key Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TORBOX API KEY</Text>

          {savedKey && (
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#4ec9b0" />
              <Text style={styles.connectedText}>Connected</Text>
              <Text style={styles.maskedKey}>{maskedKey}</Text>
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={showKey ? apiKey : (apiKey && apiKey !== savedKey ? apiKey : '')}
              onChangeText={setApiKey}
              placeholder={savedKey ? 'Enter new key to replace...' : 'Paste your Torbox API key...'}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showKey}
              onFocus={() => { if (!showKey && savedKey) setApiKey(''); }}
            />
            <TouchableOpacity onPress={() => setShowKey(!showKey)} style={styles.eyeBtn}>
              <Ionicons
                name={showKey ? 'eye-off' : 'eye'}
                size={18}
                color={Colors.textSecondary}
              />
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
            onPress={handleSave}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{savedKey ? 'Update & Test' : 'Save & Connect'}</Text>
            )}
          </TouchableOpacity>

          {savedKey && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Ionicons name="trash-outline" size={16} color={Colors.accent} />
              <Text style={styles.clearBtnText}>Remove API Key</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Help Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HOW TO GET YOUR API KEY</Text>
          <View style={styles.steps}>
            {[
              'Go to torbox.app and sign in',
              'Click your profile → API Keys',
              'Create a new key or copy your existing one',
              'Paste it above and tap Save',
            ].map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL('https://torbox.app')}
          >
            <Ionicons name="open-outline" size={14} color={Colors.accent} />
            <Text style={styles.linkText}>Open torbox.app</Text>
          </TouchableOpacity>
        </View>

        {/* Format support */}
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

        {/* App info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>TorMusic v1.0.0</Text>
          <Text style={styles.footerText}>Audio streamed directly from Torbox CDN</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 16, paddingBottom: 40 },
  headerTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 24,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 14,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(78, 201, 176, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(78, 201, 176, 0.3)',
  },
  connectedText: { color: '#4ec9b0', fontWeight: '600', fontSize: 13 },
  maskedKey: { color: Colors.textMuted, fontSize: 12, marginLeft: 4, fontFamily: 'monospace' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 14,
    padding: 13,
    fontFamily: 'monospace',
  },
  eyeBtn: {
    padding: 12,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  resultOk: { backgroundColor: 'rgba(78, 201, 176, 0.1)', borderWidth: 1, borderColor: 'rgba(78, 201, 176, 0.3)' },
  resultErr: { backgroundColor: Colors.accentMuted, borderWidth: 1, borderColor: 'rgba(255, 107, 53, 0.3)' },
  resultText: { flex: 1, fontSize: 13, lineHeight: 18 },
  resultOkText: { color: '#4ec9b0' },
  resultErrText: { color: Colors.accent },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  clearBtnText: { color: Colors.accent, fontSize: 14 },
  steps: { gap: 12 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.accent,
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: { color: Colors.accent, fontSize: 11, fontWeight: '700' },
  stepText: { flex: 1, color: Colors.textSecondary, fontSize: 14, lineHeight: 20 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.accentMuted,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  linkText: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  formats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  formatExt: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  formatNote: { color: Colors.textMuted, fontSize: 10, marginTop: 1 },
  footer: { alignItems: 'center', marginTop: 8, gap: 4 },
  footerText: { color: Colors.textMuted, fontSize: 12 },
});
