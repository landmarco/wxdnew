import { apiFetch, toApiUrl } from "./api";

const coverCache = new Map();

export async function getReleaseCoverUrl(artist, album) {
    if (!artist || !album) return null;

    const key = `${String(artist).toLowerCase()}::${String(album).toLowerCase()}`;
    if (coverCache.has(key)) {
        return coverCache.get(key);
    }

    try {
        const params = new URLSearchParams({
            artist: String(artist),
            title: String(album),
            limit: "1",
        });
        const rows = await apiFetch(`/api/releases?${params.toString()}`);
        const first = Array.isArray(rows) ? rows[0] : null;
        const cover = toApiUrl(first?.cover_url) || null;
        coverCache.set(key, cover);
        return cover;
    } catch {
        coverCache.set(key, null);
        return null;
    }
}
