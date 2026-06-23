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

// wrapper around fetch for all external API calls — prepends the base URL,
// throws on non-2xx responses (with .status attached so callers can handle 429 etc.), returns parsed JSON
export async function apiFetch(path, options) {
    const res = await fetch(`${getApiBase()}${path}`, options);
    if (!res.ok) {
        const err = new Error(`API ${path} returned ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}
