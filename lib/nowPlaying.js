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

// How long a new EventSource may sit in CONNECTING before we give up on it.
//
// A stalled connection is the dangerous case: `onerror` only fires usefully once
// readyState reaches CLOSED, but a connection that opens a socket and never gets
// a response stays CONNECTING and retries forever — holding a socket the whole
// time and never falling back to polling. See SSE_SOCKET_NOTE below for why a
// held socket matters so much here.
const STREAM_OPEN_TIMEOUT_MS = 20000;

// SSE_SOCKET_NOTE — why this file closes the stream so eagerly:
//
// Over HTTP/1.1 a browser allows only ~6 concurrent connections per host, and an
// open EventSource holds one of them for as long as it lives. The API is served
// over HTTP/1.1, so six live streams to api.wxdu.* — six tabs left open on the
// site, say — consume every slot, and from then on EVERY other request to that
// host queues behind them and never runs: search hangs on "Searching…", album art
// never loads, nothing errors out. Measured directly: six open EventSources, and
// the next fetch to the same host never completes; close them and it answers in
// under 60ms.
//
// So a tab that isn't visible has no business holding a stream open, and a stream
// that won't connect has no business holding a socket. Both are released below.
// The real ceiling lifts when the API serves HTTP/2, which multiplexes all of
// this over a single connection.

const streamListeners = new Set();
let streamSource = null; // EventSource, while the stream is in use
let streamPollTimer = null; // fallback interval, while it isn't
let streamLastPayload = null; // last payload seen, replayed to late subscribers
let streamPollInterval = 5000;
let streamOpenTimer = null; // watchdog for a stream stuck in CONNECTING
let visibilityBound = false; // whether the visibilitychange hook is installed
let streamHeld = false; // someone is actively listening; keep the stream alive

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

function clearOpenTimer() {
    if (streamOpenTimer) {
        clearTimeout(streamOpenTimer);
        streamOpenTimer = null;
    }
}

// Drops the stream but keeps subscribers and their last payload, so it can be
// resumed later (tab shown again) or replaced by polling.
function releaseStream() {
    clearOpenTimer();
    if (streamSource) {
        streamSource.close();
        streamSource = null;
    }
}

function startSharedStream() {
    if (typeof window !== "undefined" && "EventSource" in window) {
        try {
            streamSource = new EventSource(`${getApiBase()}${STREAM_PATH}`);

            // Give up on a connection that never opens, rather than letting it
            // retry forever on a held socket (see SSE_SOCKET_NOTE).
            streamOpenTimer = setTimeout(() => {
                streamOpenTimer = null;
                if (streamSource && streamSource.readyState !== EventSource.OPEN) {
                    releaseStream();
                    startPollingFallback();
                }
            }, STREAM_OPEN_TIMEOUT_MS);

            streamSource.onopen = () => clearOpenTimer();
            streamSource.onmessage = (event) => {
                clearOpenTimer();
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
                    releaseStream();
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

function stopPolling() {
    if (streamPollTimer) {
        clearInterval(streamPollTimer);
        streamPollTimer = null;
    }
}

function stopSharedStream() {
    releaseStream();
    stopPolling();
    streamLastPayload = null;
}

// Reopen the stream (or polling) and repaint at once, since we stopped listening
// while it was down and the show may have changed.
function resumeStream() {
    if (streamListeners.size === 0) return;
    if (streamSource || streamPollTimer) return;
    startSharedStream();
    apiFetch(SOURCE_PATH)
        .then(emitToListeners)
        .catch((err) => {
            if (err?.status === 404) emitToListeners(OFF_AIR_PAYLOAD);
        });
}

// Whether the connection may be dropped right now: only when the tab is hidden
// AND nobody is actually listening.
function canRelease() {
    return (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden" &&
        !streamHeld
    );
}

// An idle hidden tab doesn't need live updates, and holding a connection it can't
// show anything with is exactly how the per-host limit gets eaten
// (SSE_SOCKET_NOTE). But a hidden tab that is PLAYING still needs them: the
// now-playing payload drives navigator.mediaSession, i.e. the lock-screen and car
// display, which is precisely when the page isn't visible. So this mirrors the
// rule AudioContext already uses for the audio element itself — never tear down
// something the listener is actively using.
function handleVisibilityChange() {
    if (streamListeners.size === 0) return;

    if (canRelease()) {
        releaseStream();
        stopPolling();
        return;
    }

    if (document.visibilityState === "visible") resumeStream();
}

// Marks playback as active/inactive. While held, the stream survives a hidden
// tab; when the hold is released on a hidden tab, it is dropped immediately.
// Called by the player, which is the only thing that knows someone is listening.
export function setStreamHold(hold) {
    const next = Boolean(hold);
    if (next === streamHeld) return;
    streamHeld = next;

    if (streamHeld) {
        // Playback can start while hidden (lock-screen play), so the stream may
        // need to come back up even though the tab never became visible.
        resumeStream();
    } else if (canRelease()) {
        releaseStream();
        stopPolling();
    }
}

function bindVisibility() {
    if (visibilityBound || typeof document === "undefined") return;
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityBound = true;
}

function unbindVisibility() {
    if (!visibilityBound || typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityBound = false;
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
        bindVisibility();
        // Don't open a stream an idle hidden tab can't use; it starts when the tab
        // is shown, or when playback begins (setStreamHold).
        if (!canRelease()) {
            startSharedStream();
        }
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
        if (streamListeners.size === 0) {
            unbindVisibility();
            stopSharedStream();
        }
    };
}

// Same as subscribeCurrentPlaylist, but hands back the reduced nav-ticker shape.
export function subscribeNowPlaying(onData, opts) {
    return subscribeCurrentPlaylist((payload) => onData(reduceNowPlaying(payload)), opts);
}
