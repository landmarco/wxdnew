// base URL for the external API server (set in .env.local for dev, Cloudflare Pages env vars for prod)
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://api.wxdu.art").replace(/\/+$/, "");

// normalize API-provided relative paths to absolute URLs under API_BASE
export function toApiUrl(pathOrUrl) {
    if (!pathOrUrl) return null;
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    if (pathOrUrl.startsWith("/")) return `${API_BASE}${pathOrUrl}`;
    return `${API_BASE}/${pathOrUrl}`;
}

// wrapper around fetch for all external API calls — prepends the base URL,
// throws on non-2xx responses (with .status attached so callers can handle 429 etc.), returns parsed JSON
export async function apiFetch(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
        const err = new Error(`API ${path} returned ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}
