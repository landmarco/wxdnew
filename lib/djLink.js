// Shared helper for linking a schedule DJ cell to its show-list page.
// Cells with no resolved MySQL id (automated/otto rows, unresolved names) link
// to the station's auto-DJ page.
export const AUTO_DJ_ID = 346;

export function djHref(id) {
    const n = parseInt(id, 10);
    return Number.isInteger(n) && n > 0 ? `/dj?id=${n}` : `/dj?id=${AUTO_DJ_ID}`;
}
