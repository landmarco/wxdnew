// Data helper for the "Previous shows" page, backed by the public WXDU API.
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";

const PAGE_SIZE = 100;

// Returns every show whose starttime falls within [startDay, endDay] inclusive,
// where both bounds are station-local "YYYY-MM-DD" day keys. Newest first.
//
// The date filter is applied server-side, so we only page through shows inside
// the requested window (not the entire history). We keep requesting pages until
// one comes back short, which means we've drained the window.
export async function getShowsInRange(startDay, endDay) {
    const out = [];

    for (let offset = 0, i = 0; i < 50; i += 1, offset += PAGE_SIZE) {
        const rows = await apiFetch(
            `/api/playlists/recent?start=${startDay}&end=${endDay}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        const list = fixEncodingDeep(Array.isArray(rows) ? rows : []);
        out.push(...list);
        if (list.length < PAGE_SIZE) break;
    }

    return out;
}
