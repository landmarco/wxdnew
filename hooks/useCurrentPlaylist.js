// Hook function to get the current playlist

import { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import getCovers from "@/lib/getCovers"

const SOURCE_PATH = "/api/playlists/current";
const FILLER_IMAGE = '/CD_1_Filler.jpg';

// function to get the current playlist
export default function useCurrentPlaylist() {
  const [currentPlaylist, setCurrentPlaylist] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    // fetching the playlist
    async function fetchPlaylist() {
      try {
        setLoading(true);
        const result = await apiFetch(SOURCE_PATH);

        // reversing result.tracks so that the most recent track is first 
        const reversedTracks = Array.isArray(result.tracks)
          ? [...result.tracks].reverse()
          : [];

        // adding covers for each track / song
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

        // combining result with cover for each track
        const data = {
          ...result,
          tracks: withCovers,
        };

        setCurrentPlaylist(data);
      } catch (error) {
        console.error(
          "Failed to fetch current-playlist data:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    fetchPlaylist();

    const interval = setInterval(fetchPlaylist, 30000);

    return () => clearInterval(interval);
  }, []);

  return { currentPlaylist, loading };
}

