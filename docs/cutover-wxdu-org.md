# wxdu.org cutover — TLS renewal runbook

The station is moving `wxdu.org` off the on-prem site and onto a Cloudflare
Pages build of the `wxdufm/website` fork. This document covers the one piece of
that migration with a **hard deadline attached**: the Let's Encrypt certificate
on `152.3.0.228` breaks itself shortly after the DNS change unless someone
reissues it.

Everything else in the cutover is reversible within a DNS TTL. This is not — if
it is missed, TLS lapses on five hostnames at once, weeks after the change that
caused it, with nothing obviously connecting the two.

## What breaks, and why

`/etc/nginx/sites-available/wxdu.org` serves the current site on
`152.3.0.228:443` using the certificate lineage `adrenalin.wxdu.duke.edu`. That
one certificate covers six names:

```
adrenalin.wxdu.duke.edu
beachyhead.wxdu.duke.edu
old.wxdu.org
united.wxdu.duke.edu
www.wxdu.org
wxdu.org
```

Certbot renews it with the **HTTP-01** challenge: for each name on the
certificate, Let's Encrypt resolves that name and fetches a token over port 80.
The renewal succeeds only if *every* name validates.

After cutover, `www.wxdu.org` resolves to Cloudflare, not to `152.3.0.228`.
That challenge is served by Cloudflare Pages, which knows nothing about the
token, so it fails — and the failure is not scoped to that one name. **The
whole renewal fails**, so `adrenalin`, `beachyhead`, `old.wxdu.org`, `united`
and the apex stop getting renewed too, even though their DNS never changed.

Note that **`wxdu.org` itself does not move.** Duke's DNS (Bluecat, ISC BIND
underneath) supports neither ALIAS nor ANAME, so a zone apex cannot point at
`wxdu-website.pages.dev`. The apex keeps its `A` record to `152.3.0.228` and
serves a 301 to `https://www.wxdu.org` instead — see "Apex handling" below. It
therefore still validates HTTP-01 normally and **must stay on the certificate**:
it needs TLS of its own to serve that redirect. `www.wxdu.org` is the only name
being dropped.

Nothing breaks on cutover day. It breaks when the certificate expires, and the
error points at hostnames that have nothing to do with the migration.

## Deadline

As of 2026-08-18 the live certificate is:

- issued 2026-07-14
- **expires 2026-10-12**

Certbot begins attempting renewal at 30 days remaining, i.e. around
**2026-09-12**. That is the date to work back from.

Between the first failed attempt and actual expiry there is a month of daily
failures — which is a grace period only if someone is reading the certbot
failure mail. Do not rely on that.

## Apex handling (no ALIAS at Duke)

Confirmed with Duke OIT on 2026-08-19: Bluecat runs ISC BIND underneath and
supports neither ALIAS nor ANAME, and they will not be adding it. So `wxdu.org`
cannot point at `wxdu-website.pages.dev` — a CNAME is illegal at a zone apex,
and Pages has no stable IPs to put in an `A` record.

**Do not hardcode the Cloudflare addresses.** `wxdu-website.pages.dev` currently
answers with `172.66.47.129` / `172.66.44.127`, but those are shared anycast
addresses that Cloudflare reassigns at will. An `A` record pointing at them is a
silent outage waiting for a renumber.

Instead `www.wxdu.org` becomes canonical and the apex stays on `152.3.0.228`,
routing traffic three ways.

### Why not a plain redirect-everything

Two weeks of `/var/log/apache2/united-access.log` (the vhost serving
`wxdu.org`, `www.wxdu.org` and `united.wxdu.duke.edu`) showed a blanket
redirect would break real traffic:

| Requests | Paths | Status on new site |
| --- | --- | --- |
| 263,087 | `/plmanager/…` | 404 |
| ~5,700 | `/listen/*.pls`, `*.m3u` | 404 |
| 21,333 | `/node/…` | 404 |
| 14,558 | `/comment/…` | 404 |
| 926 | `/blog/feed` | 404 |
| 242 | `/short/…` | 404 |

`/plmanager/` is the playlist manager — `ajaxnowplaying.php` alone accounts for
146k of those hits — and it answers on the apex today. `.pls` outranks `.m3u`
roughly twelve to one; both are stream playlists baked into listeners' media
players and third-party radio directories. `/short/` is the URL shortener.

So the apex routes:

1. **Live endpoints** — `/plmanager/`, `/short/`, `/listen/*.{m3u,pls,xspf}` —
   **served in place** from Apache. Proxied, not redirected: `plmanager`
   session cookies are scoped to this host, media players may not follow a
   redirect, and short links must keep reading `wxdu.org/short/…`.
2. **Legacy Drupal content** — `/node/`, `/comment/`, `/user/`, `/sites/`,
   `/themes/`, `/skin/`, `/misc/`, `/js/`, `/images/`, `/blog/feed`, `*.html`
   and the old root-level assets — **301 to `old.wxdu.org`**. None have an
   equivalent on the new site; a working archive beats a 404. Verified no
   collisions: the new site's `public/` contains none of those directories.
3. **Everything else** — **302 to `www.wxdu.org`**.

### The blocks

Add these to `/etc/nginx/sites-available/wxdu.org`, and remove `wxdu.org` from
the `server_name` lines of the blocks that serve the old site (otherwise nginx
matches the *first* block declaring the name and these never fire). Regex
locations are tried top to bottom, first match wins, so group 1 must precede
group 2.

```nginx
server {
    listen 152.3.0.228:80;
    server_name wxdu.org;

    location ~ ^/(plmanager/|short/|listen/.+\.(m3u|pls|xspf)$) {
        return 301 https://wxdu.org$request_uri;
    }

    location ~ ^/(node/|comment/|user/|sites/|themes/|skin/|misc/|js/|images/|blog/feed|index\.php|animatedcollapse\.js|nowplaying\.js|jquery\.min\.js|jquery\.cookie\.min\.js|xdu-master\.css|orangelogo-trans2(-small)?\.png|.+\.html$) {
        return 301 https://old.wxdu.org$request_uri;
    }

    location / {
        return 302 https://www.wxdu.org$request_uri;
    }
}

server {
    listen 152.3.0.228:443 ssl;
    server_name wxdu.org;

    ssl_certificate     /etc/letsencrypt/live/adrenalin.wxdu.duke.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adrenalin.wxdu.duke.edu/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size 64m;
    limit_conn perip 40;
    limit_req  zone=reqs burst=40 nodelay;

    location ~ ^/(plmanager/|short/|listen/.+\.(m3u|pls|xspf)$) {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~ ^/(node/|comment/|user/|sites/|themes/|skin/|misc/|js/|images/|blog/feed|index\.php|animatedcollapse\.js|nowplaying\.js|jquery\.min\.js|jquery\.cookie\.min\.js|xdu-master\.css|orangelogo-trans2(-small)?\.png|.+\.html$) {
        return 301 https://old.wxdu.org$request_uri;
    }

    location / {
        return 302 https://www.wxdu.org$request_uri;
    }
}
```

Four things worth getting right:

- **Redirects live in `location`, never at server level.** A server-level
  `return` fires in the rewrite phase *before* nginx selects a location, which
  would swallow every carve-out — and the ACME challenge path with them.
- **Both schemes route directly.** The tempting shortcut is letting `:80` fall
  through to a generic `https://$host` redirect, which costs two hops
  (`http://wxdu.org` → `https://wxdu.org` → `https://www.wxdu.org`) instead of
  one. That is why the groups are duplicated across the two blocks.
- **`$request_uri` preserves path and query**, so deep links and search results
  survive.
- **Use `302` while rehearsing, `301` once settled.** Browsers cache a permanent
  redirect aggressively — which is the point, since a returning visitor then
  skips `152.3.0.228` entirely — but that cache also outlives any rollback.

The apex `A` record itself never changes, so the only DNS edit left for OIT is
repointing `www.wxdu.org` from `united.wxdu.duke.edu.` to
`wxdu-website.pages.dev.`.

### Known wart: a bad short link strands you on www

`/short/` is in group 1, so `wxdu.org/short/<code>` proxies to YOURLS and works.
A **mistyped** code does not degrade gracefully:

```
wxdu.org/short/chaus  -> YOURLS 302 -> https://wxdu.org/short   (note: no slash)
wxdu.org/short        -> group 1 wants "short/" WITH a slash, so this misses the
                         proxy rule, falls through to the catch-all, and 302s to
                         https://www.wxdu.org/short
www.wxdu.org/short    -> 404, and the address bar now says www
```

The visitor is now on the wrong host, so correcting the typo in the address bar
fails a second time. `public/_redirects` in the website repo covers that second
failure — `www.wxdu.org/short/<code>` now bounces back to the apex, so a
corrected link resolves from either host.

What it cannot fix is landing on www in the first place, which is an apex
concern. Two exact-match blocks keep the visitor here instead:

```nginx
location = /short  { return 404; }
location = /short/ { return 404; }
```

`location =` outranks regex matching in nginx, so these win without touching the
group 1 pattern. The visitor gets a plain 404 on `wxdu.org`, with the address
bar still saying `wxdu.org/short` — which is the whole point, since they can
then just finish typing the code.

Add these to **both** the `:80` and `:443` blocks. Untested — written from the
observed behaviour above, not from a live edit.

Do **not** widen group 1 to `short/?` instead. It is unanchored at the end, so
it would also swallow `/shorten`, `/shortcuts` and anything else starting with
those five letters. If you would rather widen than add exact matches, `short($|/)`
is the safe spelling.

### Re-run the inventory before flipping to 301

The path lists above are a snapshot. Before making the redirects permanent,
check what is still landing on the archive and on 404s:

```bash
sudo zcat -f /var/log/apache2/united-access.log* \
  | awk '$9 == 404 {print $7}' | sed 's/?.*//' \
  | sort | uniq -c | sort -rn | head -40
```

## When to run this

After DNS cutover, and after the old TTL has drained.

Not before: during the TTL window, resolvers still hold the old records and
real `wxdu.org` traffic keeps arriving at `152.3.0.228`. If the certificate has
already dropped those names, those visitors get a certificate error instead of
a working site.

Confirm traffic has actually moved before proceeding:

```bash
dig +short www.wxdu.org       # expect the Pages CNAME target + Cloudflare IPs
dig +short wxdu.org           # expect 152.3.0.228 — unchanged, this is correct
```

## The reissue

```bash
# 1. Confirm the lineage name — do not assume it
sudo certbot certificates

# 2. Reissue without www.wxdu.org — the ONLY name that moved to Cloudflare.
#    wxdu.org stays: it still resolves here and still terminates TLS for the
#    apex redirect. Dropping it would break https://wxdu.org outright.
#    certonly: keeps certbot from rewriting nginx server blocks.
#    --cert-name: reuses the existing lineage, so the ssl_certificate paths
#    already in wxdu.org stay correct and renewal stays a single job.
sudo certbot certonly --nginx --cert-name adrenalin.wxdu.duke.edu \
  -d adrenalin.wxdu.duke.edu \
  -d beachyhead.wxdu.duke.edu \
  -d old.wxdu.org \
  -d united.wxdu.duke.edu \
  -d wxdu.org

# 3. Reload so nginx picks up the new certificate
sudo systemctl reload nginx
```

Certbot will notice the name list is shrinking and ask you to confirm you are
**reducing** the certificate. That prompt is expected — accept it.

Do **not** add `sixsixsixties.wxdu.duke.edu` to this command. It appears in
`server_name` in the nginx config but has no DNS record at all (Duke's
authoritative nameserver returns no answer for it), so including it would fail
HTTP-01 validation and take the whole issuance down with it. See the cleanup
section below.

## Verify

```bash
# The five surviving names should all validate cleanly (ssl_verify=0).
# wxdu.org answers 301, the rest 200 — both are fine; what matters is that TLS
# verifies, so check ssl_verify, not http_code.
for h in adrenalin.wxdu.duke.edu beachyhead.wxdu.duke.edu \
         old.wxdu.org united.wxdu.duke.edu wxdu.org; do
  printf "%-30s " "$h"
  curl -s -o /dev/null -w "http=%{http_code} ssl_verify=%{ssl_verify_result}\n" \
    "https://$h/" --max-time 10
done

# The SAN list should now show five names, not six — www.wxdu.org is gone,
# wxdu.org is still there.
echo | openssl s_client -connect old.wxdu.org:443 -servername old.wxdu.org 2>/dev/null \
  | openssl x509 -noout -dates -ext subjectAltName

# The apex redirect must survive the reissue, and must be a SINGLE hop
curl -sI https://wxdu.org/shows/ --max-time 10 | grep -iE "^(HTTP|location)"
# expect: HTTP/… 301  +  location: https://www.wxdu.org/shows/

# And prove the renewal path itself is healthy — this is the real test
sudo certbot renew --dry-run
```

The dry run is the step that actually confirms the landmine is defused. Skipping
it means finding out in September.

## Cleanup in the same visit

`/etc/nginx/sites-available/wxdu.org` has `sixsixsixties.wxdu.duke.edu` on the
`server_name` lines of both the `:80` block (line 18) and the `:443` block
(line 43). It has no record in Duke's public DNS — it is resolved on the
station intranet only.

**Leave it exactly as it is.** A `server_name` entry costs nothing when the name
does not resolve publicly: nginx matches on the `Host` header of requests that
actually arrive, so an unresolvable name simply never matches from outside.
Intranet clients keep reaching it over HTTP as they always have.

The one rule: **never add it to a public certbot command.** Let's Encrypt
validates over the public internet, so an intranet-only name fails HTTP-01 and
fails the entire issuance with it. That is why it is absent from the reissue
above. It follows that this name has never had a valid public certificate — an
intranet client using `https://` gets a name-mismatch warning. That is
pre-existing behaviour and the cutover does not change it.

`www.wxdu.org` can stay on those `server_name` lines. nginx does not care about
names that no longer point at the box, and keeping it means a direct-to-IP
request with that `Host` header still reaches the old site.

`wxdu.org` is different — it must come *off* the old site's `server_name` lines
and move to the dedicated redirect blocks in "Apex handling" above. It still
resolves here, so whichever block claims it is what real visitors get. Leave it
where it is and the apex keeps serving the old site forever.

`old.wxdu.org` needs nothing. It already resolves to `152.3.0.228`, is listed
explicitly in `server_name` on both blocks (so it is not surviving by
default-server fallthrough), is on the certificate, and already serves the
current site. It is the intended post-cutover home for the old site.

## Related

- `api/README.md` — "Serving api.wxdu.org", the API-side half of the migration
  (already completed: nginx `server_name` and the expanded `api.wxdu.art` /
  `api.wxdu.org` certificate).
- `api/nginx.conf.example` — reference config for the `152.3.0.229` front door.
  Note it is only *part* of the live `/etc/nginx/sites-available/152.229`.
