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
        v
MySQL plmanager  (localhost:3306)
```

## Server setup

**Prerequisites:** Node.js ≥ 14 (install via nvm), Apache with `mod_proxy`/`mod_proxy_http` enabled, certbot.

```bash
# 1. Install dependencies
cd api/
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DB_PASSWORD
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

### 5. Example: schedule grid

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
          {data.slots
            .filter((s) => s.day === i)
            .map((s) => (
              <div key={s.ID}>
                {s.start}–{s.end}: {s.defdjname || s.title}
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
```
