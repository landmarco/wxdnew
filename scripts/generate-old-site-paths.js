#!/usr/bin/env node
/**
 * Writes lib/oldSitePaths.js — the set of URLs that still resolve on
 * old.wxdu.org, used by functions/_middleware.js to turn a 404 on the new
 * site into a redirect to the archive.
 *
 * Why a baked-in list instead of asking the old site at request time:
 *
 *   - old.wxdu.org is a frozen static archive (the wwwxdu repo). Its page set
 *     changes about never, so a live probe would spend a round trip per 404 to
 *     re-learn something that was already true at build time.
 *   - 404s are mostly bots. A probe-on-miss turns crawler noise into live load
 *     on the Duke box, which is a >10yo spinning disk.
 *   - A wrong answer here is invisible: the fallback silently stops working.
 *     A committed list can be diffed and eyeballed.
 *
 * Run it by hand after the archive changes — it is NOT part of `npm run build`,
 * because the old-site checkout does not exist on the Cloudflare builder:
 *
 *   node scripts/generate-old-site-paths.js [path-to-wwwxdu]
 *
 * Defaults to ../wwwxdu, which is where the archive sits on the dev machine.
 */

const fs = require('fs')
const path = require('path')

const OLD_ROOT = path.resolve(
	process.argv[2] || path.join(__dirname, '..', '..', 'wwwxdu')
)
const DEST = path.join(__dirname, '..', 'lib', 'oldSitePaths.js')

// Top-level directories that hold assets or live services, not pages.
//
// `short` and `plmanager` are deliberate: both are still served in place from
// the wxdu.org apex (see docs/cutover-wxdu-org.md) and robots.txt disallows
// them. Redirecting them to the archive would break working URLs.
//
// `archive` belongs to the new site's own /archive/ namespace; the one page
// the old tree has there would never win a 404 anyway.
const SKIP_DIRS = new Set([
	'archive',
	'falsegit',
	'images',
	'js',
	'misc',
	'plmanager',
	'private',
	'short',
	'sites',
	'skin',
	'themes',
])

/**
 * Canonical URL path for one archived file, or null if it isn't a page.
 *
 * "Canonical" here means the one spelling that answers 200 on old.wxdu.org
 * without a further hop. Three cases, and the third is a trap:
 *
 *   1. Ordinary page. Apache serves the archive with MultiViews, so /faqs and
 *      /faqs.html both answer 200. Store the extensionless form.
 *   2. Directory index. Keep the trailing slash: requesting /concerns earns a
 *      301 to *http*://old.wxdu.org/concerns/ — the old box downgrades the
 *      scheme when it adds the slash — and we would rather not hand a visitor
 *      an insecure hop.
 *   3. Page shadowed by a same-named directory (120 of these, all under /blog/
 *      and /node/, where Drupal left behind a bare `feed` subdirectory).
 *      Apache resolves /blog/551 to the *directory*, 301s to /blog/551/, finds
 *      no index and answers 403. Only /blog/551.html works, so the extension
 *      has to stay on.
 *
 * `siblingDirs` is the set of directory names alongside this file, used to
 * detect case 3.
 */
function canonicalPath(relPath, siblingDirs) {
	if (!relPath.endsWith('.html')) return null

	// Archived Blogger/chart pages are stored with the query string in the
	// filename (blog?page=3.html). Those live under /archive/legacy/ on the new
	// site and are handled by the rewrites in next.config.js.
	if (relPath.includes('?')) return null

	const withoutExt = relPath.slice(0, -'.html'.length)
	if (withoutExt === 'index') return '/'
	if (withoutExt.endsWith('/index')) {
		return `/${withoutExt.slice(0, -'index'.length)}`
	}

	// Case 3: a directory of the same name wins the MultiViews lookup and
	// leads to a 403. Keep .html so the file is addressed directly.
	const baseName = withoutExt.slice(withoutExt.lastIndexOf('/') + 1)
	if (siblingDirs.has(baseName)) return `/${relPath}`

	return `/${withoutExt}`
}

function walk(dir, relBase = '') {
	const entries = fs.readdirSync(dir, {withFileTypes: true})
	const siblingDirs = new Set(
		entries.filter((e) => e.isDirectory()).map((e) => e.name)
	)

	const found = []
	for (const entry of entries) {
		const rel = relBase ? `${relBase}/${entry.name}` : entry.name
		if (entry.isDirectory()) {
			if (entry.name.startsWith('.')) continue
			if (!relBase && SKIP_DIRS.has(entry.name)) continue
			found.push(...walk(path.join(dir, entry.name), rel))
		} else if (entry.isFile()) {
			const url = canonicalPath(rel, siblingDirs)
			if (url) found.push(url)
		}
	}
	return found
}

if (!fs.existsSync(OLD_ROOT)) {
	console.error(
		`Old-site checkout not found at ${OLD_ROOT}\n` +
			`Pass its path: node scripts/generate-old-site-paths.js ../wwwxdu`
	)
	process.exit(1)
}

// The root index is the new site's homepage, which can never 404. Drop it so
// the list contains only paths the fallback could actually use.
const paths = [...new Set(walk(OLD_ROOT))].filter((p) => p !== '/').sort()

const banner = `// GENERATED FILE — do not edit by hand.
//
// Regenerate with:  node scripts/generate-old-site-paths.js ../wwwxdu
//
// Every URL that resolves on old.wxdu.org, as of the last run. Consumed by
// functions/_middleware.js, which redirects a new-site 404 here when the
// archive still has the page. See that file for the routing rules.
//
// Source tree: ${path.basename(OLD_ROOT)}   Paths: ${paths.length}
`

// Emit the same quote style .prettierrc asks for, so a regeneration doesn't
// show up as a formatting diff. No archived path contains a quote or a
// backslash today; JSON.stringify is the escape hatch if one ever does.
const quote = (p) => (/['\\]/.test(p) ? JSON.stringify(p) : `'${p}'`)

const body = `export const OLD_SITE_PATHS = new Set([\n${paths
	.map((p) => `\t${quote(p)},`)
	.join('\n')}\n])\n`

fs.writeFileSync(DEST, `${banner}\n${body}`)
console.log(
	`Wrote ${paths.length} paths to ${path.relative(process.cwd(), DEST)}`
)
