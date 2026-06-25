// Fetches the playlist for a single past show (/api/playlists/:id) and enriches
// each track with album art. Mirrors useCurrentPlaylist, but for a fixed show
// id and without polling — a finished show's playlist doesn't change.

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import getCovers from "@/lib/getCovers";
import { fixEncodingDeep } from "@/lib/fixEncoding";

const FILLER_IMAGE = "/CD_1_Filler.jpg";

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

                // tracks come back in play order (orderkey); keep that order for a
                // finished show — it reads like a printed setlist, top to bottom
                const tracks = Array.isArray(result.tracks) ? result.tracks : [];

                const withCovers = await Promise.all(
                    tracks.map(async (item) => ({
                        ...item,
                        cover:
                            (await getCovers(item.artist, item.song ?? null, item.album)) ||
                            FILLER_IMAGE,
                    }))
                );

                if (!cancelled) setPlaylist({ ...result, tracks: withCovers });
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
