// Data helpers for the site-wide search page, backed by the public WXDU API's
// FULLTEXT endpoints (api/routes/search.js). Mirrors lib/djShows.js.
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";

// Both /api/search endpoints cap `limit` at 100, so each results section shows
// one 100-show window at a time and pages with offset.
export const SEARCH_PAGE_SIZE = 100;

async function search(kind, q, page = 0) {
    if (!q || !q.trim()) return [];
    const offset = Math.max(page, 0) * SEARCH_PAGE_SIZE;
    const rows = await apiFetch(
        `/api/search/${kind}?q=${encodeURIComponent(q.trim())}&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`
    );
    return fixEncodingDeep(Array.isArray(rows) ? rows : []);
}

// One 100-show window of playlists (shows) whose tracks match the query.
export function searchPlaylists(q, page = 0) {
    return search("playlists", q, page);
}

// One 100-show window of shows whose title/subtitle match the query.
export function searchShows(q, page = 0) {
    return search("shows", q, page);
}
