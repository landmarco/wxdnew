// Shared helper for linking a schedule DJ cell to its show-list page.
//
// `id` may be a single id or a comma-separated list (e.g. "665,223,489") for a
// show with multiple DJs — the /dj page and API both accept comma-separated ids
// and merge those DJs' shows. Cells with no valid id (specialty shows, custom
// "[X]" names, or names that didn't match a DJ) return null so callers can render
// them as plain, non-clickable text instead of misrouting to the auto-DJ page.
export const AUTO_DJ_ID = 346;

export function djHref(id) {
    if (id == null) return null;
    const ids = String(id)
        .split(",")
        .map((part) => parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
    return ids.length ? `/dj/?id=${ids.join(",")}` : null;
}
