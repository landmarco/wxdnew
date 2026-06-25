// Data helper for the "Past 10 days" page, backed by the public WXDU API.
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";

const PAGE_SIZE = 100;

// Returns shows whose starttime falls within the last `days` days, newest first.
// /api/playlists/recent is newest-first and capped at 100 per call, so we page
// with offset until we cross the cutoff (with a safety bound on iterations).
export async function getRecentShows(days = 10) {
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const out = [];

    for (let offset = 0, i = 0; i < 25; i += 1, offset += PAGE_SIZE) {
        const rows = await apiFetch(
            `/api/playlists/recent?limit=${PAGE_SIZE}&offset=${offset}`
        );
        const list = fixEncodingDeep(Array.isArray(rows) ? rows : []);
        if (!list.length) break;

        for (const show of list) {
            if (Number(show.starttime) >= cutoff) out.push(show);
        }

        // stop once this page reached past the cutoff or the feed ran short
        const last = list[list.length - 1];
        if (Number(last.starttime) < cutoff || list.length < PAGE_SIZE) break;
    }

    return out;
}
