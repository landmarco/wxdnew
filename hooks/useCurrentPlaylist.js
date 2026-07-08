import { useState, useEffect } from "react";
import { subscribeCurrentPlaylist } from "@/lib/nowPlaying";
import { fixEncodingDeep } from "@/lib/fixEncoding";

// Live current-playlist state for the "now playing" show/DJ display
// (NowPlayingHeader). Subscribes to the shared SSE stream (with polling
// fallback) so the display updates the moment the active show or track changes,
// instead of on a fixed timer.
//
// Only `show`/`dj` are read downstream, so tracks are passed through untouched —
// there's deliberately no per-track album-art enrichment here (the "Last Played"
// list fetches its own data via useRecentTracks).
export default function useCurrentPlaylist() {
  const [currentPlaylist, setCurrentPlaylist] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeCurrentPlaylist((payload) => {
      // Off air (no active show) → empty object, matching the prior behaviour
      // where NowPlayingHeader renders blank DJ/show fields.
      setCurrentPlaylist(payload?.show ? fixEncodingDeep(payload) : {});
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { currentPlaylist, loading };
}
