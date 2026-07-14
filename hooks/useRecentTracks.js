import { useState, useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { fixEncodingDeep } from "@/lib/fixEncoding";

// external API path for recenttracks
const SOURCE_PATH = "/api/recenttracks";

// builds a lightweight fingerprint of the track list so we can tell whether a
// poll actually brought in a new song. Each track's play start is unique, so
// joining them captures both a new song arriving at the top and the oldest one
// falling off the bottom.
function trackListSignature(tracks) {
  if (!Array.isArray(tracks)) return "";
  return tracks.map((t) => `${t?.songstart}|${t?.song}|${t?.artist}`).join("~");
}

// fetches the recent tracks
export default function useRecentTracks(limit=10) {
  const [recentTracks, setRecentTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  // remembers the last list we committed to state so repeated polls with no new
  // song don't re-set state (which would re-render every row and reload covers)
  const lastSignatureRef = useRef(null);

  useEffect(() => {

    async function fetchTracks() {
      try {
        const result = fixEncodingDeep(await apiFetch(`${SOURCE_PATH}?limit=${limit}`));

        // only update when the list changed (i.e. a new song was added);
        // otherwise leave state untouched so the section doesn't refresh
        const signature = trackListSignature(result);
        if (signature !== lastSignatureRef.current) {
          lastSignatureRef.current = signature;
          setRecentTracks(result);
        }
      } catch (error) {
        console.error("Failed to fetch current-playlist data:", error);
      } finally {
        // only the initial fetch drives the loading state; background polls
        // must never flip it back on (that would flash the loading row)
        setLoading(false);
      }
    }

    fetchTracks();

    // poll every 10 seconds, but the guard above means we only re-render when a
    // new song has actually been added
    const interval = setInterval(fetchTracks, 10000);

    return () => clearInterval(interval);
  }, [limit]);

  return { recentTracks, loading };
}

