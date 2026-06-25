import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import getCovers from "@/lib/getCovers";

// external API path for the current playlist
const SOURCE_PATH = "/api/playlists/current";

// fallback cover image shown when no album art is found
const FILLER_IMAGE = "/CD_1_Filler.jpg";

// fetches the current playlist, enriches each track with album art,
// and polls every 10 seconds so the "now playing" display stays live
export default function useCurrentPlaylist() {
  const [currentPlaylist, setCurrentPlaylist] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function fetchPlaylist() {
      try {
        setLoading(true);
        const result = await apiFetch(SOURCE_PATH);

        // reverse so the most recently played track appears first
        const reversedTracks = Array.isArray(result.tracks)
          ? [...result.tracks].reverse()
          : [];

        // fetch album art for every track in parallel
        const withCovers = await Promise.all(
          reversedTracks.map(async (item) => ({
            ...item,
            cover:
              (await getCovers(
                item.artist,
                item.song ?? null,
                item.album
              )) || FILLER_IMAGE,
          }))
        );

        // merge enriched tracks back into the original result shape
        // (preserves top-level fields like show, dj, etc.)
        const data = {
          ...result,
          tracks: withCovers,
        };

        setCurrentPlaylist(data);
      } catch (error) {
        console.error("Failed to fetch current-playlist data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPlaylist();

    // poll every 10 seconds to keep the display current
    const interval = setInterval(fetchPlaylist, 10000);

    return () => clearInterval(interval);
  }, []);

  return { currentPlaylist, loading };
}

