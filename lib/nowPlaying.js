import { apiFetch, getApiBase } from "./api";
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

// Server-Sent Events stream of the current playlist; pushes the same
// { show, dj, tracks } payload as SOURCE_PATH, but only when it changes.
const STREAM_PATH = "/api/playlists/current/stream";

// Off-air / no-active-show payload, matching what the stream sends when nothing
// is on air (so callers can treat it as data rather than an error).
const OFF_AIR_PAYLOAD = { show: null, dj: null, tracks: [] };

// Reduces a raw { show, dj, tracks } payload to the small shape the nav ticker
// needs: { artist, song, album, label, dj, comments }. Pure — shared by the
// one-shot fetch and the live stream so both render identically.
export function reduceNowPlaying(payload) {
    const show = payload?.show || null;
    const dj = payload?.dj || null;
    const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
    const track = pickCurrentTrack(tracks);

    const djName = show?.djname || dj?.defdjname || null;

    if (!track) {
        return { artist: null, song: null, album: null, label: null, songstart: null, dj: djName, comments: null };
    }

    return {
        artist: fixEncoding(track.artist) || null,
        song: fixEncoding(track.song) || null,
        album: fixEncoding(track.album) || null,
        label: fixEncoding(track.label) || null,
        // Raw start timestamp (not text) — the vinyl player derives its progress
        // bar from this; the nav ticker just ignores it.
        songstart: track.songstart || null,
        dj: fixEncoding(djName),
        comments: fixEncoding(normaliseComments(track.comments)),
    };
}

// One-shot fetch of the current show, reduced to the nav-ticker shape.
export async function getNowPlaying() {
    return reduceNowPlaying(await apiFetch(SOURCE_PATH));
}

// --- Shared live subscription -------------------------------------------
//
// A single EventSource (or, as a fallback, one polling loop) per browser tab,
// fanned out to every subscriber. Multiple widgets can want live now-playing
// data on the same page (the nav ticker, the DJ-info header, the vinyl player),
// so they share one connection rather than each opening their own — browsers
// cap concurrent SSE connections per domain (~6 over HTTP/1.1).

const streamListeners = new Set();
let streamSource = null; // EventSource, while the stream is in use
let streamPollTimer = null; // fallback interval, while it isn't
let streamLastPayload = null; // last payload seen, replayed to late subscribers
let streamPollInterval = 5000;

function emitToListeners(payload) {
    streamLastPayload = payload;
    for (const fn of streamListeners) {
        try {
            fn(payload);
        } catch {
            // one misbehaving listener shouldn't stop the others
        }
    }
}

function startPollingFallback() {
    if (streamPollTimer) return;
    const tick = async () => {
        try {
            emitToListeners(await apiFetch(SOURCE_PATH));
        } catch (err) {
            // 404 is "off air", not a failure — surface it as data. Other
            // errors: keep the last state and retry on the next tick.
            if (err?.status === 404) emitToListeners(OFF_AIR_PAYLOAD);
        }
    };
    tick();
    streamPollTimer = setInterval(tick, streamPollInterval);
}

function startSharedStream() {
    if (typeof window !== "undefined" && "EventSource" in window) {
        try {
            streamSource = new EventSource(`${getApiBase()}${STREAM_PATH}`);
            streamSource.onmessage = (event) => {
                try {
                    emitToListeners(JSON.parse(event.data));
                } catch {
                    // ignore a malformed frame; the next one will be clean
                }
            };
            streamSource.onerror = () => {
                // EventSource reconnects on its own while CONNECTING; only fall
                // back to polling if it has closed for good.
                if (streamSource && streamSource.readyState === EventSource.CLOSED) {
                    streamSource = null;
                    startPollingFallback();
                }
            };
            return;
        } catch {
            // fall through to polling
        }
    }
    startPollingFallback();
}

function stopSharedStream() {
    if (streamSource) {
        streamSource.close();
        streamSource = null;
    }
    if (streamPollTimer) {
        clearInterval(streamPollTimer);
        streamPollTimer = null;
    }
    streamLastPayload = null;
}

// Subscribe to live updates of the raw { show, dj, tracks } payload. Prefers the
// SSE stream (server pushes only on change); if EventSource is unavailable or
// the connection gives up, falls back to interval polling of SOURCE_PATH.
// `onPayload` receives the raw payload (OFF_AIR_PAYLOAD when off air). All
// subscribers share one underlying connection, which is opened on the first
// subscription and closed when the last one unsubscribes. Returns an
// unsubscribe function.
export function subscribeCurrentPlaylist(onPayload, { pollInterval = 5000 } = {}) {
    streamPollInterval = pollInterval;
    streamListeners.add(onPayload);

    if (streamListeners.size === 1) {
        startSharedStream();
    } else if (streamLastPayload != null) {
        // Replay the latest payload so a widget mounting mid-session paints
        // immediately instead of waiting for the next change/heartbeat.
        try {
            onPayload(streamLastPayload);
        } catch {
            // ignore
        }
    }

    return () => {
        streamListeners.delete(onPayload);
        if (streamListeners.size === 0) stopSharedStream();
    };
}

// Same as subscribeCurrentPlaylist, but hands back the reduced nav-ticker shape.
export function subscribeNowPlaying(onData, opts) {
    return subscribeCurrentPlaylist((payload) => onData(reduceNowPlaying(payload)), opts);
}
