import {OLD_SITE_PATHS} from '../lib/oldSitePaths.js'

/**
 * Fall back to the archive when the new site 404s.
 *
 * wxdu.org moved to this Cloudflare Pages build, but plenty of links in the
 * wild — printed, bookmarked, indexed — still point at pages that only ever
 * existed on the old Drupal site (/concerns/ is the one that prompted this).
 * Those paths used to answer; now they hit a 404 with no way onward.
 *
 * The apex redirect blocks in docs/cutover-wxdu-org.md already send *known*
 * legacy prefixes (/node/, /comment/, …) to old.wxdu.org, but only for traffic
 * arriving at wxdu.org. Anything landing on www.wxdu.org goes straight to
 * Cloudflare and never passes through nginx, so this is the only place that
 * can catch it — and the only place that sees whether the new site actually
 * had the page.
 *
 * Why redirect rather than proxy the old HTML through this origin: the archive
 * pages reference /sites/, /misc/ and /themes/ with absolute paths. Served
 * under www.wxdu.org those resolve against the new site and 404, so the page
 * arrives unstyled and half-broken. Sending the visitor to old.wxdu.org keeps
 * it intact.
 *
 * Why this can't be a _redirects file: five top-level namespaces (/archive/,
 * /blog/, /contact/, /listen/, /schedule/) exist on BOTH sites, so any splat
 * rule broad enough to be worth writing would shadow live pages. Running after
 * the asset lookup means a redirect is only ever considered for a URL the new
 * site genuinely does not serve.
 *
 * Testing locally: `next dev` and `npm run serve` both serve out/ as plain
 * static files and never load this, so a fallback path just 404s. Use the
 * Pages runtime instead:
 *
 *   npm run build-notina                  # emits out/, including _routes.json
 *   npx wrangler@3 pages dev out --port 8788
 *
 * That compiles this function the way Cloudflare does — which is also the only
 * local check that the ../lib import still bundles — and honours out/_routes.json.
 * Note _routes.json is copied from public/ by next export, so a stale out/ from
 * before that file existed will run the function on every request.
 */

const ARCHIVE_ORIGIN = 'https://old.wxdu.org'

// Deliberately 302, and worth keeping that way rather than tightening to 301
// as the apex redirects in docs/cutover-wxdu-org.md eventually did.
//
// Those point at the canonical home of a page that really did move. This one
// points at a fallback: the archive is where a URL lands only for as long as
// the new site has nothing better. Add a real page here later and it wins
// automatically — but any browser that already cached a 301 keeps going to
// old.wxdu.org and never asks us again, so the new page stays invisible to
// exactly the returning visitors most likely to look for it. A 302 is not
// cached by default, so the new page takes effect immediately for everyone.
//
// The usual argument for 301 — search engines consolidating on the target —
// cuts the wrong way too: we would be telling Google the archive is the
// permanent home of a URL we may well want back.
const REDIRECT_STATUS = 302

/**
 * Match a request path against the archive, tolerating the spelling drift
 * between the two sites.
 *
 * The new site sets trailingSlash: true, so paths mostly arrive as /foo/
 * regardless of how the archive stores them. OLD_SITE_PATHS holds exactly one
 * spelling per page — the one that answers 200 on old.wxdu.org without a
 * further hop — so try the plausible variants against it:
 *
 *   /concerns/     directory index, slash required (without it the old box
 *                  301s to *http*, downgrading the scheme)
 *   /faqs          ordinary page, MultiViews serves it extensionless
 *   /blog/551.html shadowed by a same-named directory; drop the extension and
 *                  Apache resolves the directory instead and answers 403
 *
 * Returns the canonical archive path, or null.
 */
function resolveInArchive(pathname) {
	let raw
	try {
		raw = decodeURIComponent(pathname)
	} catch {
		return null // malformed percent-encoding; not a path we stored
	}

	const base = raw.endsWith('.html') ? raw.slice(0, -'.html'.length) : raw
	const bare = base.endsWith('/') ? base.slice(0, -1) : base

	for (const candidate of [raw, `${bare}/`, bare, `${bare}.html`]) {
		if (OLD_SITE_PATHS.has(candidate)) return candidate
	}
	return null
}

export async function onRequest(context) {
	const response = await context.next()

	if (response.status !== 404) return response

	const {method} = context.request
	if (method !== 'GET' && method !== 'HEAD') return response

	const url = new URL(context.request.url)
	const archivePath = resolveInArchive(url.pathname)
	if (!archivePath) return response // gone from both sites: the real 404

	return Response.redirect(
		`${ARCHIVE_ORIGIN}${archivePath}${url.search}`,
		REDIRECT_STATUS
	)
}
