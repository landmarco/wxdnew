# wxdu-api

REST API that runs on the WXDU station machine and bridges the Cloudflare Pages frontend (`wxdu.art`) to the on-prem MySQL `plmanager` database.

## Architecture

```
Cloudflare Pages (wxdu.art)
        |
        | HTTPS  →  https://api.wxdu.art
        v
Apache reverse proxy (port 443 → 3001)
        |
        v
Node/Express API  (127.0.0.1:3001)
        |
        +──→ MySQL plmanager  (localhost:3306)   read-only DJ/playlist/schedule data
        |
        +──→ MySQL requests   (localhost:3306)   listener song requests (SELECT, INSERT only)
```

## Server setup

**Prerequisites:** Node.js ≥ 14 (install via nvm), Apache with `mod_proxy`/`mod_proxy_http` enabled, certbot.

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

# 4. Set up Apache virtual host and TLS
sudo a2enmod proxy proxy_http
sudo cp apache.conf.example /etc/apache2/sites-available/wxdu-api.conf
sudo a2ensite wxdu-api
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d api.wxdu.art

# 5. Smoke test
curl https://api.wxdu.art/api/health
curl https://api.wxdu.art/api/nowplaying
```

## Deploying updates

After pushing to git, pull and restart on the server:

```bash
cd /mnt/md1/wxdnew   # wherever the repo lives on the server
git pull
pm2 restart wxdu-api
```

## Switching from api.wxdu.art to api.wxdu.org

When Duke IT adds an A record for `api.wxdu.org` → `152.3.0.229`, do the following:

1. **Apache config** — add a `ServerAlias` to `/etc/apache2/sites-available/wxdu-api.conf`:
   ```apache
   ServerName api.wxdu.art
   ServerAlias api.wxdu.org
   ```
2. **Expand the TLS cert** to cover both names:
   ```bash
   sudo certbot --apache -d api.wxdu.art -d api.wxdu.org
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
| GET | `/api/playlists/recent` | List of recent shows, newest first. Accepts `?limit=` and `?offset=` |
| GET | `/api/playlists/:id` | A specific show with its tracks and DJ info |
| GET | `/api/playlists/dj/:djId` | All shows by a DJ. Accepts `?limit=` and `?offset=` |
| GET | `/api/djs` | All active DJs |
| GET | `/api/djs/:id` | A single DJ's public profile |
| GET | `/api/schedule` | Current schedule with one row per time slot |
| GET | `/api/requests` | All listener song requests, newest first. Accepts `?limit=` (max 100) and `?offset=` |
| POST | `/api/requests` | Submit a song request. Rate-limited to 5 per minute per IP. |
| GET | `/api/releases` | New music releases, newest first. Accepts `?limit=` (max 100) and `?offset=`. Includes `cover_url` per release. |
| GET | `/api/releases/:id` | Single release with full detail and linked downloads data (track listing, blurb, cover URL) |
| GET | `/api/releases/:id/cover` | Streams the release cover image directly |

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

### 3. Example: now-playing ticker

```jsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export default function NowPlaying() {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch('/api/nowplaying');
        setTrack(data);
      } catch {
        setTrack(null); // off air or API unreachable
      }
    }

    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!track) return null;
  return <span>{track.artist} — {track.song}</span>;
}
```

### 4. Example: current playlist page

```jsx
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export default function CurrentPlaylist() {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch('/api/playlists/current')
      .then(setData)
      .catch(() => setData(null));
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
