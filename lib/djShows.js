// Data helpers for the DJ show-list page, backed by the public WXDU API.
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";

// The /api/playlists/dj/:djId endpoint caps `limit` at 100, so the DJ page
// shows one 100-show window at a time and pages with offset.
export const DJ_SHOWS_PAGE_SIZE = 100;

// DJ profile info (name, title, link). Returns null on miss so the page can
// still fall back to the djname carried on the show rows.
export async function getDj(djId) {
    if (djId == null || djId === "") return null;
    try {
        return fixEncodingDeep(await apiFetch(`/api/djs/${encodeURIComponent(djId)}`));
    } catch {
        return null;
    }
}

// One 100-show window of a DJ's shows, newest first, for the given 0-based page.
export async function getDjShows(djId, page = 0) {
    if (djId == null || djId === "") return [];
    const offset = Math.max(page, 0) * DJ_SHOWS_PAGE_SIZE;
    const rows = await apiFetch(
        `/api/playlists/dj/${encodeURIComponent(djId)}?limit=${DJ_SHOWS_PAGE_SIZE}&offset=${offset}`
    );
    return fixEncodingDeep(Array.isArray(rows) ? rows : []);
}
