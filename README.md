<p>A statically generated site for WXDU, built off of a fork from our buddies over at WXYC. Built using the frontend framework React, NextJs as a static site generator and TinaCMS as a Git-based content management system. Styled using TailwindCSS, with help from the MUI Joy UI component library on implementing breadcrumbs and Headless UI on implementing dropdown menus.</p>

<p>Supports content management for the radio station's blog and for an archive of the radio station's specialty shows and live events. Very much a work in progress!</p>

<a href="https://wxdu.org/" target="_blank"> Visit live site</a>

## Deployment

`npm run build` runs TinaCMS, then `next build && next export`, then
`scripts/generate-sitemap.js`. The result is a fully static `out/` directory —
there is no Next.js server at runtime, which is why `images: { unoptimized: true }`
is set and why image sizing has to happen before assets are committed
(see [CLAUDE.md](CLAUDE.md)).

Two **Cloudflare Pages** projects build this repo:

| Host           | Role                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| `www.wxdu.org` | Production. Built from the `wxdufm/website` fork; also reachable at `wxdu-website.pages.dev`. |
| `wxdu.art`     | Dev/staging.                                                                                  |

Three things that are _not_ Cloudflare Pages, and are easy to mistake for it:

- **`wxdu.org` (the apex)** is nginx on `152.3.0.228`. Duke's DNS supports
  neither ALIAS nor ANAME, so the zone apex cannot point at Pages. It routes
  three ways instead — live endpoints proxied in place, legacy Drupal paths
  redirected to the archive, everything else sent to `www.wxdu.org`. The config
  and the reasoning are in [docs/cutover-wxdu-org.md](docs/cutover-wxdu-org.md),
  which also carries a **TLS renewal deadline** worth reading before it bites.
- **`old.wxdu.org`** is the frozen archive of the previous Drupal site, served
  from the same box. `functions/_middleware.js` falls back to it when this site
  404s on a URL the archive still has.
- **`api.wxdu.org` / `api.wxdu.art`** is a Node/Express service on the station
  machine, behind nginx. See [api/README.md](api/README.md).

### Files Pages reads from the build output

`next export` copies `public/` verbatim into `out/`, which is how these get
where Pages expects them:

- `public/_headers` — cache policy per asset class.
- `public/_routes.json` — keeps the Function off asset requests.
- `functions/` — deployed from the repo root, not from `public/`.

### Not GitHub Pages

The site used to deploy there. The root `CNAME` file that pinned the custom
domain has been removed; the one remaining leftover is `actions/configure-pages`
in `.github/workflows/pr-open.yml`, which is inert because that workflow only
builds pull requests — it does not deploy anything.

### Testing Functions locally

`next dev` and `npm run serve` serve `out/` as plain static files and never load
`functions/`, so anything in there silently does nothing. Use the Pages runtime:

```bash
npm run build-notina
npx wrangler@3 pages dev out --port 8788
```
