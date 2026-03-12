import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { fetchArtistImage } from '../services/torbox';
import { AlbumArt } from './AlbumArt';

interface Props {
  artist: string;
  fallbackTorrentName: string;
  size: number;
  borderRadius?: number;
}

export function ArtistImage({ artist, fallbackTorrentName, size, borderRadius }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const br = borderRadius ?? size / 2;

  useEffect(() => {
    setImageUrl(null);
    if (!artist) return;
    fetchArtistImage(artist).then(url => setImageUrl(url));
  }, [artist]);

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: br }}
        resizeMode="cover"
      />
    );
  }

  return (
    <AlbumArt torrentName={fallbackTorrentName} size={size} borderRadius={br} />
  );
}
