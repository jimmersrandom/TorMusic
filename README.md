# TorMusic 🎵

A music player for your Torbox library. Streams audio files directly, including FLAC.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Start the app
```bash
npx expo start
```

### 3. Open on iPhone
- Install **Expo Go** from the App Store
- Scan the QR code shown in your terminal
- Enter your Torbox API key in Settings

## Features
- 🎵 FLAC, MP3, AAC, WAV, OGG, OPUS support
- 📱 Background audio playback
- 🔐 Secure API key storage
- 📂 Browse by album/torrent
- 🕐 Recently added view
- 🔀 Shuffle & repeat
- ⏩ Seek bar with progress

## How it works
1. Connects to Torbox API with your key
2. Filters your torrents for audio files only
3. Streams them via Torbox's CDN — no downloading needed

## Torbox API Key
Get yours at [torbox.app](https://torbox.app) → Profile → API Keys

## Tech Stack
- Expo (React Native)
- expo-av (FLAC support via iOS AVFoundation)
- expo-secure-store (encrypted API key storage)
- Expo Router (file-based navigation)
