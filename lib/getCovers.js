// Fetches an album cover URL from the local /api/albumCover route.
// Returns a URL string on success, or null if unavailable.
// Never throws — callers can safely fall back with (await getCovers(...)) || FILLER_IMAGE.
export default async function getCovers(artist, song, album) {
    try {
        let res;
        if (!song) {
            // no song title available — search by artist + album only
            res = await fetch(
                `/api/albumCover?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`
            );
        } else {
            // full search: artist + song + album for the best match
            res = await fetch(
                `/api/albumCover?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(song)}&album=${encodeURIComponent(album)}`
            );
        }

        // treat non-2xx as "no cover found" rather than a hard error
        if (!res.ok) return null;

        const cover = await res.json();
        return cover;
    } catch (e) {
        // network failures or JSON parse errors — degrade gracefully
        console.error("[getCovers]", e);
        return null;
    }
}
