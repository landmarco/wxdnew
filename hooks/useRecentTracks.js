import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import getCovers from "@/lib/getCovers";
import { fixEncodingDeep } from "@/lib/fixEncoding";

// external API path for recenttracks
const SOURCE_PATH = "/api/recenttracks";

// fetches the recent tracks
export default function useRecentTracks(limit=10) {
  const [recentTracks, setRecentTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    async function fetchTracks() {
      try {
        setLoading(true);
        const result = fixEncodingDeep(await apiFetch(`${SOURCE_PATH}?limit=${limit}`));

        setRecentTracks(result);
      } catch (error) {
        console.error("Failed to fetch current-playlist data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchTracks();

    // poll every 10 seconds to keep the display current
    const interval = setInterval(fetchTracks, 10000);

    return () => clearInterval(interval);
  }, []);

  return { recentTracks, loading };
}

