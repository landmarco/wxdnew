// Fetches an album cover URL from the station's public MongoDB release archive.
//
// Calls the public WXDU API (/api/releases) directly via apiFetch — the internal
// /api/albumCover Next route doesn't exist in the static export, so it 404s in
// production. Same approach as lib/recentlyPlayed.js.
//
// Never throws — callers can safely fall back with (await getCovers(...)) || FILLER_IMAGE.
import { apiFetch, getApiBase } from "./api";

export default async function getCovers(artist, song, album) {
    // The release archive is keyed by artist + album title; `song` isn't used
    // for this lookup (the old route's localhost Discogs-by-track path can't run
    // in the browser anyway).
    if (!artist || !album) return null;

    try {
        const results = await apiFetch(
            `/api/releases?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(album)}`
        );
        const coverUrl = results?.[0]?.cover_url; // e.g. "/api/releases/<id>/cover"
        return coverUrl ? `${getApiBase()}${coverUrl}` : null;
    } catch (e) {
        // network failures, non-2xx (apiFetch throws), or parse errors — degrade gracefully
        console.error("[getCovers]", e);
        return null;
    }
}
