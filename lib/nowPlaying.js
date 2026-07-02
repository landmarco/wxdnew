import { apiFetch } from "./api";
import { fixEncoding } from "./fixEncoding";

// Upstream endpoint that returns { show, dj, tracks } for the active show.
const SOURCE_PATH = "/api/playlists/current";

// Decode the upstream `comments` field, which can arrive as a plain string or
// as a JSON-serialised Node Buffer ({ type: "Buffer", data: [...] }). Runs in
// the browser, so we use TextDecoder rather than Node's Buffer.
function normaliseComments(rawComments) {
    if (typeof rawComments === "string") {
        return rawComments.trim() || null;
    }

    if (
        rawComments &&
        typeof rawComments === "object" &&
        rawComments.type === "Buffer" &&
        Array.isArray(rawComments.data)
    ) {
        try {
            return new TextDecoder().decode(new Uint8Array(rawComments.data)).trim() || null;
        } catch {
            return null;
        }
    }

    return null;
}

// Pick the currently playing track: the most recent by songstart, falling back
// to the highest orderkey when timestamps are missing or equal.
function pickCurrentTrack(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return null;
    }

    const sorted = [...tracks].sort((a, b) => {
        const timeA = Date.parse(a?.songstart || "");
        const timeB = Date.parse(b?.songstart || "");
        const hasTimeA = Number.isFinite(timeA);
        const hasTimeB = Number.isFinite(timeB);
        if (hasTimeA && hasTimeB && timeA !== timeB) {
            return timeA - timeB;
        }

        const orderA = Number.isFinite(Number(a?.orderkey)) ? Number(a.orderkey) : -Infinity;
        const orderB = Number.isFinite(Number(b?.orderkey)) ? Number(b.orderkey) : -Infinity;
        return orderA - orderB;
    });

    // After ascending sort, the most recent track is last.
    return sorted[sorted.length - 1] || null;
}

// Fetches the current show from the external API and reduces it to the small
// shape the nav ticker needs: { artist, song, album, label, dj, comments }.
export async function getNowPlaying() {
    const payload = await apiFetch(SOURCE_PATH);

    const show = payload?.show || null;
    const dj = payload?.dj || null;
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    const track = pickCurrentTrack(tracks);

    const djName = show?.djname || dj?.defdjname || null;

    if (!track) {
        return { artist: null, song: null, album: null, label: null, dj: djName, comments: null };
    }

    return {
        artist: fixEncoding(track.artist) || null,
        song: fixEncoding(track.song) || null,
        album: fixEncoding(track.album) || null,
        label: fixEncoding(track.label) || null,
        dj: fixEncoding(djName),
        comments: fixEncoding(normaliseComments(track.comments)),
    };
}
