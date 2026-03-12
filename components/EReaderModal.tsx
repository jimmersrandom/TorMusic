import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Dimensions, SafeAreaView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import {
  EpubBook, downloadEpub, saveReadingProgress,
  loadReadingProgress, getCachedLocalUri,
} from '../services/epub';

const { width, height } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onClose: () => void;
  books: EpubBook[];
}

// ─── Book Library Card ────────────────────────────────────────────────────────
function BookCard({ book, onOpen }: { book: EpubBook; onOpen: (b: EpubBook) => void }) {
  const [progress, setProgress] = useState(0);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    loadReadingProgress(book.id).then(p => { if (p) setProgress(p.percentage); });
    getCachedLocalUri(book.id).then(uri => setCached(!!uri));
  }, [book.id]);

  return (
    <TouchableOpacity style={styles.bookCard} onPress={() => onOpen(book)} activeOpacity={0.8}>
      <View style={styles.bookCover}>
        <Ionicons name="book" size={36} color={Colors.accent || '#a78bfa'} />
      </View>
      <View style={styles.bookInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
        {book.author ? <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text> : null}
        <View style={styles.progressRow}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>
        {cached && <Ionicons name="checkmark-circle" size={12} color="#4ade80" style={{ marginTop: 2 }} />}
      </View>
    </TouchableOpacity>
  );
}

// ─── EPUB Reader HTML ─────────────────────────────────────────────────────────
function buildReaderHTML(localUri: string, fontSize: number, savedCfi?: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1c1c1e; overflow: hidden; }
  #viewer {
    width: ${width}px;
    height: ${height}px;
  }
  .epub-container, .epub-view {
    width: 100% !important;
    height: 100% !important;
  }
</style>
</head>
<body>
<div id="viewer"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/epubjs/dist/epub.min.js"></script>
<script>
  const book = ePub("${localUri}");
  const rendition = book.renderTo("viewer", {
    width: ${width},
    height: ${height},
    spread: "none",
    flow: "paginated",
  });

  rendition.themes.default({
    body: {
      background: "#1c1c1e !important",
      color: "#f5f5f0 !important",
      "font-size": "${fontSize}px !important",
      "font-family": "Georgia, serif !important",
      padding: "0 24px !important",
      "line-height": "1.7 !important",
    },
    "a": { color: "#a78bfa !important" }
  });

  ${savedCfi ? `rendition.display("${savedCfi}");` : `rendition.display();`}

  let toc = [];
  book.loaded.navigation.then(nav => {
    toc = nav.toc;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toc', toc }));
  });

  book.ready.then(() => {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  });

  rendition.on('relocated', (location) => {
    const pct = book.locations.percentageFromCfi(location.start.cfi);
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'location',
      cfi: location.start.cfi,
      chapter: location.start.href,
      percentage: pct || 0,
    }));
  });

  // Generate locations for percentage tracking
  book.ready.then(() => book.locations.generate(1024));

  // Swipe gestures
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0) rendition.next();
      else rendition.prev();
    }
  });

  // Tap centre to toggle chrome
  document.addEventListener('click', e => {
    const x = e.clientX;
    if (x > ${width * 0.25} && x < ${width * 0.75}) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'toggleChrome' }));
    } else if (x <= ${width * 0.25}) {
      rendition.prev();
    } else {
      rendition.next();
    }
  });

  window.goToChapter = (href) => rendition.display(href);
  window.setFontSize = (size) => {
    rendition.themes.default({ body: { "font-size": size + "px !important" } });
  };
</script>
</body>
</html>`;
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function EReaderModal({ visible, onClose, books }: Props) {
  const [openBook, setOpenBook] = useState<EpubBook | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<any[]>([]);
  const [fontSize, setFontSize] = useState(18);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [currentCfi, setCurrentCfi] = useState('');
  const [percentage, setPercentage] = useState(0);
  const [savedCfi, setSavedCfi] = useState<string | undefined>();
  const webviewRef = useRef<WebView>(null);

  const openBook_ = useCallback(async (book: EpubBook) => {
    setOpenBook(book);
    setDownloading(true);
    setDownloadProgress(0);
    try {
      const progress = await loadReadingProgress(book.id);
      setSavedCfi(progress?.cfi);
      const uri = await downloadEpub(book, setDownloadProgress);
      setLocalUri(uri);
    } catch (e: any) {
      console.error('EPUB open error:', e.message);
    } finally {
      setDownloading(false);
    }
  }, []);

  const closeBook = useCallback(() => {
    if (currentCfi && openBook) {
      saveReadingProgress(openBook.id, currentCfi, percentage);
    }
    setOpenBook(null);
    setLocalUri(null);
    setToc([]);
    setShowToc(false);
    setShowChrome(true);
    setSavedCfi(undefined);
  }, [currentCfi, openBook, percentage]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'toc') setToc(msg.toc);
      if (msg.type === 'toggleChrome') setShowChrome(v => !v);
      if (msg.type === 'location') {
        setCurrentCfi(msg.cfi);
        setPercentage(msg.percentage);
      }
    } catch {}
  }, []);

  const changeFontSize = (size: number) => {
    setFontSize(size);
    webviewRef.current?.injectJavaScript(`window.setFontSize(${size}); true;`);
    setShowFontMenu(false);
  };

  const goToChapter = (href: string) => {
    webviewRef.current?.injectJavaScript(`window.goToChapter("${href}"); true;`);
    setShowToc(false);
  };

  // ── Library view ──
  if (!openBook) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="chevron-down" size={28} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Library</Text>
            <View style={{ width: 44 }} />
          </View>

          {books.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="book-outline" size={64} color={Colors.subtext} />
              <Text style={styles.emptyText}>No ebooks found</Text>
              <Text style={styles.emptySubtext}>Add .epub files to your Torbox storage</Text>
            </View>
          ) : (
            <FlatList
              data={books}
              keyExtractor={b => b.id}
              renderItem={({ item }) => <BookCard book={item} onOpen={openBook_} />}
              contentContainerStyle={{ padding: 16 }}
            />
          )}
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Reader view ──
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={closeBook}>
      <View style={styles.readerContainer}>

        {/* Top chrome */}
        {showChrome && (
          <SafeAreaView style={styles.readerTopChrome}>
            <View style={styles.readerTopRow}>
              <TouchableOpacity onPress={closeBook} style={styles.headerBtn}>
                <Ionicons name="chevron-left" size={24} color="#f5f5f0" />
              </TouchableOpacity>
              <Text style={styles.readerTitle} numberOfLines={1}>{openBook.title}</Text>
              <View style={styles.readerTopActions}>
                <TouchableOpacity onPress={() => setShowFontMenu(v => !v)} style={styles.headerBtn}>
                  <Text style={styles.aaButton}>Aa</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowToc(true)} style={styles.headerBtn}>
                  <Ionicons name="list" size={22} color="#f5f5f0" />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        )}

        {/* Font size menu */}
        {showFontMenu && (
          <View style={styles.fontMenu}>
            {[14, 16, 18, 20, 24, 28].map(s => (
              <TouchableOpacity key={s} onPress={() => changeFontSize(s)} style={[styles.fontBtn, fontSize === s && styles.fontBtnActive]}>
                <Text style={[styles.fontBtnText, fontSize === s && { color: '#a78bfa' }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* WebView or loading */}
        {downloading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#a78bfa" />
            <Text style={styles.loadingText}>
              {downloadProgress > 0 ? `Downloading… ${Math.round(downloadProgress * 100)}%` : 'Preparing book…'}
            </Text>
          </View>
        ) : localUri ? (
          <WebView
            ref={webviewRef}
            source={{ html: buildReaderHTML(localUri, fontSize, savedCfi) }}
            style={styles.webview}
            onMessage={handleMessage}
            scrollEnabled={false}
            originWhitelist={['*']}
            allowFileAccess
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
          />
        ) : null}

        {/* Bottom chrome */}
        {showChrome && (
          <SafeAreaView style={styles.readerBottomChrome}>
            <View style={styles.readerBottomRow}>
              <Text style={styles.progressLabel}>{Math.round(percentage * 100)}%</Text>
              <View style={styles.bottomProgressBar}>
                <View style={[styles.bottomProgressFill, { width: `${percentage * 100}%` }]} />
              </View>
            </View>
          </SafeAreaView>
        )}

        {/* TOC sheet */}
        <Modal visible={showToc} transparent animationType="slide" onRequestClose={() => setShowToc(false)}>
          <TouchableOpacity style={styles.tocOverlay} onPress={() => setShowToc(false)} activeOpacity={1}>
            <View style={styles.tocSheet}>
              <Text style={styles.tocTitle}>Chapters</Text>
              <FlatList
                data={toc}
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.tocItem} onPress={() => goToChapter(item.href)}>
                    <Text style={styles.tocItemText} numberOfLines={1}>{item.label?.trim()}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border || '#333' },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: Colors.text },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text },
  emptySubtext: { fontSize: 14, color: Colors.subtext, textAlign: 'center', paddingHorizontal: 32 },
  bookCard: { flexDirection: 'row', padding: 12, marginBottom: 12, backgroundColor: Colors.card || '#1c1c1e', borderRadius: 12, gap: 12 },
  bookCover: { width: 60, height: 80, backgroundColor: '#2c2c2e', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bookInfo: { flex: 1, justifyContent: 'space-between' },
  bookTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  bookAuthor: { fontSize: 13, color: Colors.subtext },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progressBar: { flex: 1, height: 3, backgroundColor: '#3a3a3c', borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: '#a78bfa', borderRadius: 2 },
  progressText: { fontSize: 11, color: Colors.subtext },
  readerContainer: { flex: 1, backgroundColor: '#1c1c1e' },
  readerTopChrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'rgba(28,28,30,0.92)' },
  readerTopRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4 },
  readerTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#f5f5f0', textAlign: 'center' },
  readerTopActions: { flexDirection: 'row' },
  aaButton: { fontSize: 17, fontWeight: '700', color: '#f5f5f0' },
  fontMenu: { position: 'absolute', top: 90, right: 12, zIndex: 20, backgroundColor: '#2c2c2e', borderRadius: 12, padding: 8, flexDirection: 'row', gap: 4, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8 },
  fontBtn: { padding: 8, borderRadius: 8 },
  fontBtnActive: { backgroundColor: '#3a3a3c' },
  fontBtnText: { fontSize: 14, color: '#f5f5f0' },
  webview: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#f5f5f0', fontSize: 15 },
  readerBottomChrome: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'rgba(28,28,30,0.92)' },
  readerBottomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  progressLabel: { fontSize: 12, color: '#8e8e93', width: 36 },
  bottomProgressBar: { flex: 1, height: 3, backgroundColor: '#3a3a3c', borderRadius: 2 },
  bottomProgressFill: { height: 3, backgroundColor: '#a78bfa', borderRadius: 2 },
  tocOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  tocSheet: { backgroundColor: '#1c1c1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: height * 0.6 },
  tocTitle: { fontSize: 18, fontWeight: '700', color: '#f5f5f0', marginBottom: 16 },
  tocItem: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#3a3a3c' },
  tocItemText: { fontSize: 15, color: '#f5f5f0' },
});
