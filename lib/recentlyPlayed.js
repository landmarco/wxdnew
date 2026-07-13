import { apiFetch, getApiBase } from "./api";
import { fixEncoding } from "./fixEncoding";

// Resolved-cover cache, keyed by "artist||album". The now-playing widgets
// refresh this list on every live update, and the same albums recur across
// refreshes, so caching avoids re-hitting /api/releases for art we already
// resolved. Failures aren't cached, so a transient error can retry.
const coverCache = new Map();

// Look up album art for a track from the station's MongoDB release archive.
// Client-safe: only hits the public WXDU API. (The server-side getAlbumCover
// also tried a localhost Discogs service and a personal Discogs token, neither
// of which exist in the browser / static deployment.)
export async function getAlbumCover(artist, album) {
    if (!artist || !album) return null;

    const key = `${artist}||${album}`;
    if (coverCache.has(key)) return coverCache.get(key);

    try {
        const results = await apiFetch(
            `/api/releases?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(album)}`
        );
        const coverUrl = results?.[0]?.cover_url; // e.g. "/api/releases/<id>/cover"
        const resolved = coverUrl ? `${getApiBase()}${coverUrl}` : null;
        coverCache.set(key, resolved);
        return resolved;
    } catch {
        return null;
    }
}

// Builds the "Recently Played" list: the 5 most recent real tracks across the
// most recent shows, each with album art. This is a browser-side port of the
// old /api/current-playlist Next route, which doesn't exist in the static
// export. Runs against api.wxdu.art / api.wxdu.org via the domain-aware wrapper.
export async function getRecentlyPlayed() {
    const recentShows = await apiFetch("/api/playlists/recent?limit=5");

    // Drop shows scheduled in the future (starttime is Unix seconds).
    const now = Math.floor(Date.now() / 1000);
    const pastShows = (Array.isArray(recentShows) ? recentShows : []).filter(
        (show) => show.starttime <= now
    );

    // Collect real tracks (artist !== '*****') newest-first across shows until
    // we have at least 5.
    let tracks = [];
    for (const show of pastShows) {
        const showData = await apiFetch(`/api/playlists/${show.ID}`);
        const filtered = (showData.tracks || [])
            .filter((t) => t.artist !== "*****")
            .sort((a, b) => new Date(b.songstart) - new Date(a.songstart));

        tracks = [...tracks, ...filtered];
        if (tracks.length >= 5) break;
    }

    tracks = tracks.slice(0, 5);

    // Fetch album art for all songs in parallel.
    return Promise.all(
        tracks.map(async (track) => ({
            song: fixEncoding(track.song),
            artist: fixEncoding(track.artist),
            album: fixEncoding(track.album),
            label: fixEncoding(track.label),
            songstart: track.songstart,
            albumArt: await getAlbumCover(track.artist, track.album),
        }))
    );
}
