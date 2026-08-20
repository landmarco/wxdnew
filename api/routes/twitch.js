const { Router } = require('express');
const https = require('https');

const router = Router();

// Twitch live-status for the homepage "takeover" widget (components/homepage/
// TwitchTakeover.js). The frontend polls this and only mounts the Twitch player
// when it says we're live, so the ~99% of visitors who arrive while the channel
// is dark never download Twitch's embed at all.
//
// This has to live server-side: Helix needs an app access token, which needs
// the client SECRET, which can't ship in a static export.

const CHANNEL = process.env.TWITCH_CHANNEL || 'wxdu887';

// How long a status answer is reused before we ask Helix again. Every visitor
// polls this endpoint, so without a cache a busy homepage would burn through
// Twitch's rate limit (800 points/min per client id); with it, we make at most
// one Helix call a minute no matter how many people are watching. 60s is also
// about how fast anyone needs to learn a stream went up.
const CACHE_MS = 60 * 1000;

// Serve a stale answer rather than a wrong one if Helix is unreachable. A brief
// Twitch outage mid-broadcast shouldn't yank the video off the homepage.
const STALE_MS = 10 * 60 * 1000;

// Refresh the app access token this far before it actually expires, so a call
// can't land in the gap. Tokens last ~60 days, so this is very cheap insurance.
const TOKEN_SKEW_MS = 60 * 1000;

let token = null; // { value, expiresAt }
let cache = null; // { payload, fetchedAt } — fetchedAt is the age of the DATA
let inFlight = null; // dedupes concurrent refreshes into one Helix call
let nextTryAt = 0; // after a failure, don't call Twitch again until this time

// Minimal JSON-over-HTTPS helper. The server runs Node 16 (see
// ecosystem.config.js), which has no global fetch, and this is the API's only
// outbound HTTP call — not worth a dependency.
function httpsJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (err) {
          return reject(new Error(`Twitch returned non-JSON (${res.statusCode})`));
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    // Don't let a hung Twitch connection hold the request (and the cache
    // refresh) open indefinitely.
    req.setTimeout(8000, () => req.destroy(new Error('Twitch request timed out')));
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  if (token && Date.now() < token.expiresAt - TOKEN_SKEW_MS) return token.value;

  const form = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  }).toString();

  const { status, body } = await httpsJson(
    {
      method: 'POST',
      hostname: 'id.twitch.tv',
      path: '/oauth2/token',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
      },
    },
    form
  );

  if (status !== 200 || !body?.access_token) {
    throw new Error(`Twitch token request failed (${status})`);
  }

  token = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return token.value;
}

// One Helix lookup. `retryOn401` lets us survive a token that Twitch revoked
// early (or that we cached across a client-secret rotation): drop it and go
// around once with a fresh one.
async function fetchStatus(retryOn401 = true) {
  const accessToken = await getToken();

  const { status, body } = await httpsJson({
    method: 'GET',
    hostname: 'api.twitch.tv',
    path: `/helix/streams?user_login=${encodeURIComponent(CHANNEL)}`,
    headers: {
      'Client-Id': process.env.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (status === 401 && retryOn401) {
    token = null;
    return fetchStatus(false);
  }
  if (status !== 200) {
    throw new Error(`Twitch streams request failed (${status})`);
  }

  // An empty data array means the channel isn't streaming. `type` is 'live' for
  // a real broadcast; anything else (Twitch has used 'error' historically) we
  // treat as not live rather than guessing.
  const stream = Array.isArray(body?.data) ? body.data[0] : null;
  if (!stream || stream.type !== 'live') {
    return { live: false, channel: CHANNEL };
  }

  return {
    live: true,
    channel: CHANNEL,
    title: stream.title || '',
    viewers: stream.viewer_count ?? 0,
    startedAt: stream.started_at || null,
  };
}

// GET /api/twitch/status
// { live: false, channel } when the channel is dark, or
// { live: true, channel, title, viewers, startedAt } when it's broadcasting.
// Always 200 — the homepage widget treats any failure as "not live", and a 500
// here would just be noise in the browser console on every poll.
router.get('/status', async (req, res) => {
  // Not configured (no Twitch app credentials in .env): report offline. This is
  // the state on any deployment that hasn't set the vars up, and it should be
  // quiet rather than an error every minute.
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    return res.json({ live: false, channel: CHANNEL, configured: false });
  }

  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_MS;
  // A failure leaves the cached data stale, which would otherwise make every
  // single request try Twitch again — exactly the wrong behaviour during an
  // outage. Back off for a cache interval and serve what we have meanwhile.
  const backingOff = Date.now() < nextTryAt;

  if (!fresh && !backingOff) {
    try {
      // Collapse a thundering herd of pollers onto a single Helix call.
      inFlight = inFlight || fetchStatus();
      const payload = await inFlight;
      cache = { payload, fetchedAt: Date.now() };
      nextTryAt = 0;
    } catch (err) {
      console.error('twitch status error', err.message);
      nextTryAt = Date.now() + CACHE_MS;
      // Keep serving a recent answer if we have one, so a blip at Twitch doesn't
      // blank the widget mid-broadcast. Past STALE_MS, stop guessing and go dark.
      if (!cache || Date.now() - cache.fetchedAt > STALE_MS) {
        cache = { payload: { live: false, channel: CHANNEL }, fetchedAt: Date.now() };
      }
    } finally {
      inFlight = null;
    }
  }

  // Cache-Control is deliberately short: the whole point is noticing promptly
  // when a stream starts, and the server-side cache above is what actually
  // protects Twitch's rate limit.
  res.set('Cache-Control', 'public, max-age=30');
  res.json(cache.payload);
});

module.exports = router;
