// Small shared formatters for show timestamps.
// `starttime` from the API is a Unix timestamp in seconds.

export function showDate(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function showDateTime(starttime) {
    if (!starttime) return "";
    return new Date(starttime * 1000).toLocaleString("en-US", {
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
        hour: "2-digit",
        minute: "2-digit",
    });
}

// "YYYY-MM-DD" in local time — used as a stable grouping key for day sections.
export function showDayKey(starttime) {
    if (!starttime) return "";
    const d = new Date(starttime * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
