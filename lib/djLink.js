// Shared helpers for linking a schedule cell to whatever it should open.
//
// A schedule cell's optional pin (everything after the final "|") decides this:
//
//   "Show | 900"                    -> /dj/?id=900          one DJ's show list
//   "Show | 665,223"                -> /dj/?id=665,223      a show with several DJs
//   'Show | "local music hour"'     -> /search/?q=...       search by show name
//   'Show | "a", "b"'               -> /search/?q=a&q=b     either name (OR)
//   'Show | "a", 900'               -> /search/?q=a&dj=900  either name, or that DJ
//
// Schedule searches carry `in=shows`, which restricts the results page to show
// titles/subtitles/sub-genres. Without it the page also lists shows whose
// TRACKLIST happens to contain the words, which is right for the search box but
// wrong here — clicking a show should find that show, not every playlist that
// mentioned it.
//
// Cells with no usable pin return null so callers can render them as plain,
// non-clickable text instead of misrouting to the auto-DJ page.
export const AUTO_DJ_ID = 346;

// "665, 223" / ["665","223"] / 665 -> [665, 223]; drops anything non-positive.
function normalizeIds(id) {
    if (id == null) return [];
    const parts = Array.isArray(id) ? id : String(id).split(",");
    return parts
        .map((part) => parseInt(String(part).trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
}

// `id` may be a single id or a comma-separated list (e.g. "665,223,489") for a
// show with multiple DJs — the /dj page and API both accept comma-separated ids
// and merge those DJs' shows.
export function djHref(id) {
    const ids = normalizeIds(id);
    return ids.length ? `/dj/?id=${ids.join(",")}` : null;
}

// Search link for a cell pinned to one or more quoted name terms, optionally
// alongside DJ ids. Terms repeat as `q` so the search page can OR them together;
// ids ride along as a single comma-separated `dj`. Returns null when nothing
// usable survives.
export function searchHref(terms, djIds) {
    const cleanTerms = (Array.isArray(terms) ? terms : [])
        .map((term) => String(term ?? "").trim())
        .filter(Boolean);
    const ids = normalizeIds(djIds);
    if (!cleanTerms.length && !ids.length) return null;

    const params = cleanTerms.map((term) => `q=${encodeURIComponent(term)}`);
    if (ids.length) params.push(`dj=${ids.join(",")}`);
    params.push("in=shows");
    return `/search/?${params.join("&")}`;
}

// What a schedule cell should link to: a search when the cell pinned name terms,
// otherwise that cell's resolved DJ id(s). `search` is the entry this cell has in
// the schedule carrier's search grid (null for cells with no term pin).
export function scheduleCellHref(search, djId) {
    if (search && Array.isArray(search.terms) && search.terms.length) {
        return searchHref(search.terms, search.djIds);
    }
    return djHref(djId);
}
