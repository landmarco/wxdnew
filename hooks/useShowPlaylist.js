// Fetches the playlist for a single past show (/api/playlists/:id). Mirrors
// useCurrentPlaylist, but for a fixed show id and without polling — a finished
// show's playlist doesn't change.

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { fixEncodingDeep } from "@/lib/fixEncoding";

export default function useShowPlaylist(showId) {
    // null until a show is loaded; { show, dj, tracks } once resolved
    const [playlist, setPlaylist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        // wait until the caller has a real id (e.g. router.isReady)
        if (showId == null || showId === "") return;

        let cancelled = false;

        async function fetchPlaylist() {
            try {
                setLoading(true);
                setError(null);

                const result = fixEncodingDeep(
                    await apiFetch(`/api/playlists/${encodeURIComponent(showId)}`)
                );

                if (!cancelled) setPlaylist(result);
            } catch (err) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchPlaylist();
        return () => {
            cancelled = true;
        };
    }, [showId]);

    return { playlist, loading, error };
}
