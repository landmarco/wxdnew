// Where the live stream comes from, and when to give up on the primary host.
//
// Two hostnames serve the SAME Icecast mounts by different routes: the primary
// goes through Cloudflare, the fallback (when one is configured) goes straight
// to the origin. Both are build-time settings, so changing either is a Pages
// environment-variable change and a redeploy rather than a code edit.
//
// NEXT_PUBLIC_STREAM_FALLBACK_HOST is empty by default, which disables failover
// entirely — the fallback host has to actually be serving before it's worth
// sending a listener there, and an unset variable is the safe state.
export const PRIMARY_HOST = process.env.NEXT_PUBLIC_STREAM_HOST || "stream.wxdu.art";
export const FALLBACK_HOST = process.env.NEXT_PUBLIC_STREAM_FALLBACK_HOST || "";

export const MOUNT_LOW = "wxdu192.mp3";
export const MOUNT_HIGH = "wxdu320.mp3";

export const streamUrl = (host, high) =>
    `https://${host}/${high ? MOUNT_HIGH : MOUNT_LOW}`;

// Swaps the host of an existing stream URL, keeping whichever mount is playing.
// Failover must not silently drop a listener from 320 back to 192.
export const withHost = (url, host) =>
    url.replace(/^https:\/\/[^/]+/, `https://${host}`);

// When to give up on the primary host and try the fallback.
//
// Two triggers, whichever comes first, because attempts alone are a bad clock
// here. A refused media connection fires NO 'error' event — the element just
// sits at readyState 0 in networkState 2 — so retries are paced by the 15s
// startup watchdog, then the 6s stall timeout, with the backoff doubling
// between them. Counting to three that way takes over a minute of silence,
// far too long to leave someone staring at a lit play button. Elapsed outage
// time is the real trigger; the attempt count is a backstop for a host that
// fails fast and repeatedly.
//
// Neither is 1 or instant. A single failure is the common case — a handoff, a
// tunnel, a dropped packet — and the existing backoff already recovers from it
// on the primary. Bouncing hosts on every blip would sound worse than waiting,
// and would put listeners on the unshielded origin for no reason.
export const FAILOVER_AFTER_MS = 12000;
export const FAILOVER_AFTER_ATTEMPTS = 3;

// Whether this reconnect attempt should switch to the fallback host.
// `outageMs` is how long the current outage has lasted (0 if not dropped),
// `attempts` how many reconnects have already been tried against this host.
export function shouldFailover({ activeHost, attempts, outageMs }) {
    if (!FALLBACK_HOST) return false;
    if (activeHost !== PRIMARY_HOST) return false;
    return outageMs >= FAILOVER_AFTER_MS || attempts >= FAILOVER_AFTER_ATTEMPTS;
}
