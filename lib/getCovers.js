// Look up album art for a track from the station's public MongoDB release archive.
//
// Client-safe browser port of the old /api/albumCover Next route, which doesn't
// exist in the static export. Hits api.wxdu.art / api.wxdu.org directly via the
// domain-aware apiFetch wrapper (same approach as lib/recentlyPlayed.js).
//
// Returns null — never throws — on any miss, so a single failed cover lookup
// can't reject the Promise.all in the playlist hooks and blank the whole list.
import { apiFetch, getApiBase } from "./api";

export default async function getCovers(artist, song, album) {
    // The archive is keyed by artist + album title; `song` isn't used here.
    // (The old route's localhost Discogs-by-track lookup can't run in a browser.)
    if (!artist || !album) return null;

    try {
        const results = await apiFetch(
            `/api/releases?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(album)}`
        );
        const coverUrl = results?.[0]?.cover_url; // e.g. "/api/releases/<id>/cover"
        return coverUrl ? `${getApiBase()}${coverUrl}` : null;
    } catch {
        return null;
    }
}
