// Data helpers for the site-wide search page, backed by the public WXDU API's
// FULLTEXT endpoints (api/routes/search.js). Mirrors lib/djShows.js.
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";
import { getDjShows, DJ_SHOWS_PAGE_SIZE } from "./djShows";

// Both /api/search endpoints cap `limit` at 100, so each results section shows
// one 100-show window at a time and pages with offset.
export const SEARCH_PAGE_SIZE = 100;

// How many 100-row pages we'll pull per source when combining several of them.
// The API has no OR across terms, so a multi-term query is N separate searches
// merged here — which means paging can't be delegated to the server and we have
// to hold the rows ourselves. 3 pages is 300 shows per term: comfortably more
// than any real show's run, while keeping a stray broad term from fetching
// thousands of rows. `truncated` tells the page when it hit this ceiling so it
// can say so rather than silently showing a partial answer.
export const MAX_PAGES_PER_SOURCE = 3;

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

// One 100-show window of shows whose title/subtitle/sub-genre match the query.
export function searchShows(q, page = 0) {
    return search("shows", q, page);
}

// Walks one source's pages until it returns a short page or we hit the ceiling.
async function drainSource(fetchPage, pageSize) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES_PER_SOURCE; page += 1) {
        const batch = await fetchPage(page);
        rows.push(...batch);
        if (batch.length < pageSize) return { rows, truncated: false };
    }
    return { rows, truncated: true };
}

// Union of several sources' rows, de-duplicated by show ID (a show matching two
// terms must appear once) and re-sorted newest-first, since merging independently
// sorted lists doesn't preserve the order.
function mergeShows(results) {
    const byId = new Map();
    for (const { rows } of results) {
        for (const row of rows) {
            if (row?.ID != null && !byId.has(row.ID)) byId.set(row.ID, row);
        }
    }
    return {
        rows: Array.from(byId.values()).sort(
            (a, b) => (b.starttime || 0) - (a.starttime || 0)
        ),
        truncated: results.some((r) => r.truncated),
    };
}

// Every show matching ANY of `terms` by title/subtitle/sub-genre, plus every show
// belonging to any of `djIds`. This is the OR the API can't express in one query.
export async function searchShowsCombined(terms, djIds = []) {
    const results = await Promise.all([
        ...terms.map((term) => drainSource((p) => searchShows(term, p), SEARCH_PAGE_SIZE)),
        ...djIds.map((id) => drainSource((p) => getDjShows(id, p), DJ_SHOWS_PAGE_SIZE)),
    ]);
    return mergeShows(results);
}

// Every show with a track matching ANY of `terms`. DJ ids don't apply here —
// a DJ id selects shows, not tracks.
export async function searchPlaylistsCombined(terms) {
    const results = await Promise.all(
        terms.map((term) => drainSource((p) => searchPlaylists(term, p), SEARCH_PAGE_SIZE))
    );
    return mergeShows(results);
}
