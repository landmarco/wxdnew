// Small shared formatters for show timestamps.
// `starttime` from the API is a Unix timestamp in seconds.
// Times are pinned to the station's local timezone (US Eastern) so they read
// the same for every visitor regardless of where they're browsing from.
const STATION_TZ = "America/New_York";

export function showDate(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleDateString("en-US", {
        timeZone: STATION_TZ,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function showDateTime(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleString("en-US", {
        timeZone: STATION_TZ,
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function showTime(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleTimeString("en-US", {
        timeZone: STATION_TZ,
        hour: "2-digit",
        minute: "2-digit",
    });
}

// "YYYY-MM-DD" in the station's timezone — used as a stable grouping key for
// day sections. Pinned to Eastern so day boundaries match the displayed times.
// en-CA formats as "YYYY-MM-DD".
export function showDayKey(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleDateString("en-CA", {
        timeZone: STATION_TZ,
    });
}

// Today's date as a "YYYY-MM-DD" day key in the station's timezone.
export function todayDayKey() {
    return new Date().toLocaleDateString("en-CA", { timeZone: STATION_TZ });
}

// Shift a "YYYY-MM-DD" day key by a whole number of days. Operates on the
// calendar date directly (via UTC noon) so it never trips over DST.
export function shiftDayKey(dayKey, deltaDays) {
    const [year, month, day] = dayKey.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    date.setUTCDate(date.getUTCDate() + deltaDays);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// Whole-day count between two day keys, inclusive (start and end same → 1).
export function dayKeySpan(startDay, endDay) {
    const toUTC = (key) => {
        const [y, m, d] = key.split("-").map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUTC(endDay) - toUTC(startDay)) / 86400000) + 1;
}

// Pretty long label for a "YYYY-MM-DD" day key, e.g. "Monday, Jul 2".
export function dayKeyLabel(dayKey, opts = {}) {
    const [year, month, day] = dayKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        ...opts,
    });
}
