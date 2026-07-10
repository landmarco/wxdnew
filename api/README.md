# wxdu-api

REST API that runs on the WXDU station machine and bridges the Cloudflare Pages frontend (`wxdu.art`) to the on-prem MySQL `plmanager` database.

## Architecture

```
Cloudflare Pages (wxdu.art)
        |
        | HTTPS  →  https://api.wxdu.art
        v
nginx reverse proxy (port 443 → 3001, terminates TLS)
        |
        v
Node/Express API  (127.0.0.1:3001)
        |
        +──→ MySQL plmanager  (localhost:3306)   read-only DJ/playlist/schedule data
        |
        +──→ MySQL requests   (localhost:3306)   listener song requests (SELECT, INSERT only)
```

## Server setup

**Prerequisites:** Node.js ≥ 14 (install via nvm), nginx, certbot with the nginx plugin (`python3-certbot-nginx`).

> **Note:** `api.wxdu.art` is fronted by **nginx** (it terminates TLS and proxies straight to Node). It used to sit behind Apache; that setup is preserved for reference in `apache.conf.example`, but the live config is `nginx.conf.example`.

```bash
# 1. Install dependencies
cd api/
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DB_PASSWORD, REQUESTS_DB_PASSWORD
# ALLOWED_ORIGINS already includes both wxdu.art and wxdu.org

# 3. Start with PM2
#    First update ecosystem.config.js with the correct cwd and interpreter paths,
#    then run:
pm2 start ecosystem.config.js
pm2 save

# 4. Set up the nginx server block and TLS
sudo cp nginx.conf.example /etc/nginx/sites-available/api.wxdu.art
sudo ln -s /etc/nginx/sites-available/api.wxdu.art /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.wxdu.art

# 5. Smoke test
curl https://api.wxdu.art/api/health
curl https://api.wxdu.art/api/nowplaying
# SSE stream — should print an immediate `data: {...}` line and stay open
# (Ctrl-C to stop). If it hangs with no output or drops, the nginx proxy is
# buffering/timing out — see "Live now-playing stream" below.
curl -N https://api.wxdu.art/api/playlists/current/stream
```

## Deploying updates

After pushing to git, pull and restart on the server:

```bash
cd /var/www/wxdnew   # where the repo lives on the server
git pull
pm2 restart wxdu-api
```

## Switching from api.wxdu.art to api.wxdu.org

When Duke IT adds an A record for `api.wxdu.org` → `152.3.0.229`, do the following:

1. **nginx config** — add `api.wxdu.org` to the `server_name` line in both server blocks of `/etc/nginx/sites-available/api.wxdu.art`:
   ```nginx
   server_name api.wxdu.art api.wxdu.org;
   ```
   then `sudo nginx -t && sudo systemctl reload nginx`.
2. **Expand the TLS cert** to cover both names:
   ```bash
   sudo certbot --nginx -d api.wxdu.art -d api.wxdu.org
   ```
3. **Cloudflare Pages env var** — in the Cloudflare Pages dashboard, update `NEXT_PUBLIC_API_URL` to `https://api.wxdu.org` and redeploy.
4. **Local dev** — update `wxdnew/.env.local` to `NEXT_PUBLIC_API_URL=https://api.wxdu.org`.
5. `ALLOWED_ORIGINS` in `.env` already includes both domains — no change needed there.
6. Once confirmed working, the `api.wxdu.art` DNS record and `ServerAlias` can be removed at your discretion.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{"ok":true}` — use to confirm the server is up |
| GET | `/api/nowplaying` | Most recently logged track from the active show |
| GET | `/api/playlists/current` | Full active show with DJ info and all tracks |
| GET | `/api/playlists/current/stream` | Server-Sent Events stream of the current playlist — pushes the same payload as `/current`, but only when it changes (see [Live now-playing stream](#live-now-playing-stream-sse)) |
| GET | `/api/playlists/recent` | List of recent shows, newest first. Accepts `?limit=`, `?offset=`, and an optional `?start=`/`?end=` (`YYYY-MM-DD`, inclusive) date window. With no `?limit=` or `?start=`, defaults to the last 10 days |
| GET | `/api/playlists/:id` | One or more shows with tracks and DJ info. Accepts comma-separated IDs. |
| GET | `/api/playlists/dj/:djId` | Shows by one or more DJs. Accepts comma-separated IDs, `?limit=`, `?offset=` |
| GET | `/api/djs` | All active DJs. Accepts `?ids=`, `?firstname=`, `?lastname=` (see below) |
| GET | `/api/djs/:id` | One or more DJ profiles. Accepts comma-separated IDs. |
| GET | `/api/schedule` | Current schedule with one row per time slot |
| GET | `/api/requests` | All listener song requests, newest first. Accepts `?limit=` (max 100) and `?offset=` |
| POST | `/api/requests` | Submit a song request. Rate-limited to 5 per minute per IP. |
| GET | `/api/releases` | New music releases, newest first. Accepts `?limit=` (max 100), `?offset=`, `?artist=`, `?title=` (case-insensitive partial match). Includes `cover_url` per release. |
| GET | `/api/releases/:id` | One or more releases with downloads data and cover URL. Accepts comma-separated IDs. |
| GET | `/api/releases/:id/cover` | Streams the release cover image. Accepts `?size=small` (300px) or `?size=medium` (600px) for resized JPEG output; resized images are disk-cached. |
| GET | `/api/recenttracks` | Most recently played tracks across all shows, with cover art resolved from MongoDB. Accepts `?limit=` (max 50, default 10). |
| GET | `/api/charts/mostplayed` | Most played songs (or albums, with `?isChart=true`) over a date range. Accepts `?dateStart=` and `?dateEnd=` (`YYYY-MM-DD`); if both are omitted, defaults to the last month. Accepts `?limit=` (max 500, default 50). |
| GET | `/api/events` | Upcoming events with venue info, ordered by date. Pass `?all=1` to include past events. |
| GET | `/api/events/:id` | One or more events with venue info. Accepts comma-separated IDs. |

### Multi-ID lookups

Several endpoints accept comma-separated IDs in the path or as a query parameter. A single ID returns a plain object (backward-compatible); multiple IDs return an array.

**DJs — query params on `GET /api/djs`:**
```
# Fetch specific DJs by ID
GET /api/djs?ids=103,278,431

# Look up a DJ by name (searches first/last name; does not return them)
GET /api/djs?firstname=Jane&lastname=Smith
GET /api/djs?lastname=Smith        # either param works alone
```

**DJs — comma-separated path on `GET /api/djs/:id`:**
```
GET /api/djs/103,278,431
```

**Playlists:**
```
# One or more shows (each with full track list and DJ info)
GET /api/playlists/42,87,156

# Shows from one or more DJs
GET /api/playlists/dj/103,278
```

**Releases — search by artist/title on `GET /api/releases`:**
```
GET /api/releases?artist=magic+tuber
GET /api/releases?title=heavy+water
GET /api/releases?artist=magic+tuber&title=heavy+water
```
Matches are case-insensitive and partial — `artist=magic` matches "Magic Tuber Stringband". Combines with `?limit=` and `?offset=` for pagination.

**Cover image resizing** — append `?size=` to the cover endpoint:
```
GET /api/releases/6a262304.../cover?size=small    # 300px wide, quality 80
GET /api/releases/6a262304.../cover?size=medium   # 600px wide, quality 85
GET /api/releases/6a262304.../cover               # original file, no processing
```
Resized images are cached to disk (`/tmp/wxdu-covers/`) and served from cache on subsequent requests.

**Recent tracks with cover art:**
```
GET /api/recenttracks          # last 10 played tracks
GET /api/recenttracks?limit=5  # last 5
```
Each track includes `artist`, `song`, `album`, `label`, `starttime`, and `cover_url`. Append `?size=small` to `cover_url` when rendering on the homepage widget.

**Releases — comma-separated IDs:**
```
GET /api/releases/6a262304372acb6bfe63ae5a,6a1f24daf563803ba0ff8a70
```

The `:id` in `/api/releases/:id/cover` is always the `releases` collection `_id`, not the downloads ID.

**Events:**
```
GET /api/events/1,4,7
```

### POST `/api/requests`

**Request body** (JSON):

| Field | Required | Max length | Notes |
|-------|----------|------------|-------|
| `text` | Yes | 500 chars | The request text |
| `user_name` | No | 100 chars | Requester's display name |
| `email` | No | 200 chars | Stored but never returned by the GET endpoint |

**Response:** `201 {"ok":true}` on success, `400` for validation errors, `429` if rate-limited.

### Database access for requests

The requests endpoints use a dedicated MySQL user with only `SELECT` and `INSERT` on `requests.request`. To create it:

```sql
CREATE USER 'wxdu_requests'@'localhost' IDENTIFIED BY '<strong_password>';
GRANT SELECT, INSERT ON requests.request TO 'wxdu_requests'@'localhost';
FLUSH PRIVILEGES;
```

Add the corresponding credentials to `.env`:

```
REQUESTS_DB_HOST=localhost
REQUESTS_DB_USER=wxdu_requests
REQUESTS_DB_PASSWORD=<strong_password>
REQUESTS_DB_NAME=requests
```

### Events (MySQL `tickets` database)

The events endpoints use a dedicated MySQL user with `SELECT` on both `tickets.event` and `tickets.location`. To create it:

```sql
CREATE USER 'wxdu_tickets'@'localhost' IDENTIFIED BY '<strong_password>';
GRANT SELECT ON tickets.event TO 'wxdu_tickets'@'localhost';
GRANT SELECT ON tickets.location TO 'wxdu_tickets'@'localhost';
FLUSH PRIVILEGES;
```

Add to `.env`:

```
TICKETS_DB_HOST=localhost
TICKETS_DB_USER=wxdu_tickets
TICKETS_DB_PASSWORD=<strong_password>
TICKETS_DB_NAME=tickets
```

Each event response includes `location_name`, `location_city`, and `location_url` joined from the `location` table. The location `phone`, `email`, and `callin_pref` fields are never returned.

### Releases (MongoDB)

The releases endpoints connect to the `wxdu` MongoDB database (collections: `releases`, `downloads`). They use a dedicated read-only MongoDB user. To create it (run in `mongosh`):

```javascript
use wxdu
db.createUser({
  user: "wxdu_api_reader",
  pwd: "<strong_password>",
  roles: [{ role: "read", db: "wxdu" }]
})
```

Add to `.env`:

```
MONGO_URI=mongodb://wxdu_api_reader:<strong_password>@localhost:27017/wxdu
```

The `GET /api/releases/:id/cover` endpoint serves cover images directly from disk at `/mnt/md1/music-database/public/media/{downloads_id}/`. It picks the best available `.jpg` from the release's `nonaudio` file list (prefers a file with "cover" in the name, falls back to `embeddedcover.jpg`).

**Fields stripped from all releases responses:** `review`, `reviewer`, `edits`, `alphabetize_by`, and from linked downloads data: `edits`, `checkedoutby_*`, `reuploader_*`, `assignee_*`, `origfilename`, `dirname`, `rec_alph`, and track `absolute_path` / `itunes_unique_id`.

## Live now-playing stream (SSE)

`GET /api/playlists/current/stream` is a [Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) endpoint that keeps the now-playing ticker and the `/current` playlist page live without every browser polling on its own timer.

**How it works:**

- A single shared poller in the API queries the DB every `STREAM_POLL_MS` (2s) — but **only while at least one client is connected**, and it stops again when the last one disconnects.
- It computes a small change signature (active show + track count + latest track ID) and pushes the full `{ show, dj, tracks }` payload to all connected clients **only when that signature changes**. So N listeners cost one DB query per tick, not N, and idle time sends nothing but a heartbeat.
- On connect, a client is sent the current state immediately (so it isn't blank until the next change), then updates as they happen.
- When nothing is on air, the stream sends `{ "show": null, "dj": null, "tracks": [] }` rather than a 404, so clients render the off-air state as data.
- A comment heartbeat (`: ping`) is sent every ~25s to keep the connection open through the proxy.

The payload is byte-for-byte the same shape as `GET /api/playlists/current`, so clients can share one reducer between the one-shot fetch and the stream.

**nginx proxy requirements:** SSE needs nginx to *not* buffer the response and to *not* time out the long-lived connection. `nginx.conf.example` handles both with a dedicated `location` for the stream path (`proxy_buffering off;` + `proxy_read_timeout 3600s;`). The Node route also sends `X-Accel-Buffering: no`, which nginx honours. Without these, events arrive batched/delayed or the connection is dropped. If you hand-maintain the server block, replicate that `location`.

**Latency:** a newly logged track reaches every connected browser within the poll interval (≤2s) plus network. To trade latency against DB query volume, adjust `STREAM_POLL_MS` in `routes/playlists.js` — cost scales with the interval, not with the number of listeners.

## Using the API from the frontend

### 1. Set the API base URL

In `wxdnew/.env.local` (gitignored, create it locally and in Cloudflare Pages settings):

```
NEXT_PUBLIC_API_URL=https://api.wxdu.art
```

### 2. Import the fetch helper

```js
// lib/api.js is already in this repo
import { apiFetch } from '../lib/api';
```

### 3. Example: now-playing ticker (live via SSE)

`lib/nowPlaying.js` provides `subscribeNowPlaying`, which prefers the SSE stream and transparently falls back to polling if `EventSource` is unavailable or the connection drops. It hands back a reduced `{ artist, song, album, label, dj, comments }` shape and returns an unsubscribe function.

```jsx
import { useState, useEffect } from 'react';
import { subscribeNowPlaying } from '../lib/nowPlaying';

export default function NowPlaying() {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    // Pushes an update whenever the on-air track changes; no manual timer.
    return subscribeNowPlaying(setTrack);
  }, []);

  if (!track?.song) return null; // off air
  return <span>{track.artist} — {track.song}</span>;
}
```

### 4. Example: current playlist page (live via SSE)

`subscribeCurrentPlaylist` streams the raw `{ show, dj, tracks }` payload (the off-air payload has `show: null`). Same fetch-vs-stream fallback as above.

```jsx
import { useState, useEffect } from 'react';
import { subscribeCurrentPlaylist } from '../lib/nowPlaying';

export default function CurrentPlaylist() {
  const [data, setData] = useState(null);

  useEffect(() => {
    return subscribeCurrentPlaylist((payload) =>
      setData(payload?.show ? payload : null)
    );
  }, []);

  if (!data) return <p>Off air</p>;

  const { show, dj, tracks } = data;
  return (
    <>
      <h1>{show.title || show.othergenre} with {show.djname}</h1>
      <table>
        <tbody>
          {tracks.map((t) =>
            t.artist === '*****' ? null : (
              <tr key={t.ID}>
                <td>{t.artist}</td>
                <td>{t.song}</td>
                <td>{t.album}</td>
                <td>{t.label}</td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </>
  );
}
```

### 5. Example: song request form

```jsx
import { useState } from 'react';
import { apiFetch } from '../lib/api';

export default function RequestForm() {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null); // 'ok' | 'error' | 'ratelimit'

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, user_name: name }),
      });
      setStatus('ok');
      setText('');
      setName('');
    } catch (err) {
      setStatus(err.status === 429 ? 'ratelimit' : 'error');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Request a song..." required maxLength={500} />
      <button type="submit">Submit</button>
      {status === 'ok' && <p>Request sent!</p>}
      {status === 'ratelimit' && <p>Too many requests — try again in a minute.</p>}
      {status === 'error' && <p>Something went wrong, please try again.</p>}
    </form>
  );
}
```

### 6. Example: schedule grid

```jsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Schedule() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/api/schedule')
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <p>Loading...</p>;

  return (
    <>
      {DAYS.map((day, i) => (
        <div key={day}>
          <h2>{day}</h2>
          {data
            .filter((s) => s.day === i)
            .map((s) => (
              <div key={s.ID}>
                {s.start}–{s.end}: {s.title}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
```
