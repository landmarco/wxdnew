#!/usr/bin/env node
/**
 * Writes out/sitemap.xml by walking the exported site.
 *
 * This reads the build output rather than the route sources on purpose.
 * Several route families (blog posts, specialty-show categories) come from
 * Tina at build time via getStaticPaths, so deriving them from source would
 * mean re-running those queries here and drifting the moment either side
 * changes. Whatever `next export` actually produced is the truth.
 *
 * Runs after `next export`. See the build script in package.json.
 */

const fs = require('fs')
const path = require('path')

const OUT = path.join(__dirname, '..', 'out')
const BASE = 'https://www.wxdu.org' // canonical host; the apex only redirects here

// Keep in sync with public/robots.txt. No point advertising URLs in the
// sitemap that we ask crawlers not to fetch — Search Console flags that
// as a "blocked by robots.txt" error on every one of them.
const EXCLUDE = [
	/^\/search\//,
	/^\/show\//,
	/^\/dj\//,
	/^\/playlist\//,
	/^\/current\//,
	/^\/api\//,
	/^\/admin\//,
	/^\/fix-schedule-grid\//,
	/^\/404\//,
]

function findIndexFiles(dir, acc = []) {
	for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) findIndexFiles(full, acc)
		else if (entry.name === 'index.html') acc.push(full)
	}
	return acc
}

function toRoute(file) {
	const rel = path.relative(OUT, path.dirname(file)).split(path.sep).join('/')
	// trailingSlash: true in next.config.js, so every route ends in a slash
	return rel === '' ? '/' : `/${rel}/`
}

if (!fs.existsSync(OUT)) {
	console.error(`generate-sitemap: no ${OUT} — run this after \`next export\``)
	process.exit(1)
}

const entries = findIndexFiles(OUT)
	.map((file) => ({route: toRoute(file), mtime: fs.statSync(file).mtime}))
	.filter(({route}) => !EXCLUDE.some((re) => re.test(route)))
	.sort((a, b) => a.route.localeCompare(b.route))

const body = entries
	.map(
		({route, mtime}) =>
			`\t<url>\n` +
			`\t\t<loc>${BASE}${route}</loc>\n` +
			`\t\t<lastmod>${mtime.toISOString().slice(0, 10)}</lastmod>\n` +
			`\t</url>`
	)
	.join('\n')

const xml =
	`<?xml version="1.0" encoding="UTF-8"?>\n` +
	`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
	`${body}\n` +
	`</urlset>\n`

fs.writeFileSync(path.join(OUT, 'sitemap.xml'), xml)
console.log(`generate-sitemap: wrote ${entries.length} URLs to out/sitemap.xml`)
