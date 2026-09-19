// Resolve the external API base URL at call time.
//
// The site is a static export, so this code runs in the browser. We derive the
// API host from the domain the site is currently served from, which means the
// SAME build works on either domain and migrates automatically:
//   wxdu.art  ->  https://api.wxdu.art
//   wxdu.org  ->  https://api.wxdu.org   (auto after the .org migration; no rebuild)
//
// For anything that isn't a known wxdu domain (local dev, previews, SSR/build),
// we fall back to NEXT_PUBLIC_API_URL (set in .env.local) and finally to the
// current production API.
export function getApiBase() {
    if (typeof window !== "undefined") {
        const match = window.location.hostname.match(/(?:^|\.)wxdu\.(art|org)$/);
        if (match) {
            return `https://api.wxdu.${match[1]}`;
        }
    }
    return process.env.NEXT_PUBLIC_API_URL || "https://api.wxdu.art";
}

// How long any single API call may hang before we give up on it.
//
// `fetch` has no timeout of its own: if a connection stalls after the TLS
// handshake — no response, no error — the promise never settles and every caller
// awaiting it waits forever. That is exactly how the search page ends up stuck on
// "Searching…" with no error to show: not a slow query, a request that never
// finishes. Bounding it turns an invisible hang into an error the UI can render.
const DEFAULT_TIMEOUT_MS = 15000;

// wrapper around fetch for all external API calls — prepends the base URL,
// throws on non-2xx responses (with .status attached so callers can handle 429 etc.), returns parsed JSON
// Pass `timeoutMs` to override the default; pass `signal` to cancel it yourself
// (both work together — whichever fires first wins).
export async function apiFetch(path, options = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = options;

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener("abort", abortFromCaller, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${getApiBase()}${path}`, { ...rest, signal: controller.signal });
        if (!res.ok) {
            const err = new Error(`API ${path} returned ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } catch (err) {
        // Distinguish our own timeout from a caller-initiated cancel, so a page
        // that cancels on unmount doesn't report an error to the user.
        if (err?.name === "AbortError" && !signal?.aborted) {
            const timeoutErr = new Error(`API ${path} timed out after ${timeoutMs}ms`);
            timeoutErr.code = "ETIMEDOUT";
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", abortFromCaller);
    }
}
