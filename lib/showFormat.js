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
