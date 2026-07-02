import Link from 'next/link'

// Hostnames that are "us" — absolute links to these are really internal and
// should route client-side rather than reload the page (and jump domains).
const INTERNAL_HOSTS = /(^|\.)wxdu\.(art|org)$/i

// Renders markdown links: internal links use Next <Link> for client-side
// navigation (so the live stream isn't torn down), while external links stay
// as plain anchors. Absolute links to our own domains are normalised to a
// relative path so they work on any host (localhost, wxdu.art, wxdu.org).
// Internal paths get a trailing slash before any ?query/#hash to match
// `trailingSlash: true`, otherwise the static export redirects and the click
// becomes a full page load.
export function MarkdownLink(props) {
	const url = props?.url || ''

	// Resolve to an internal path ("/...") or null if the link is external.
	let path = null
	if (url.startsWith('/')) {
		path = url
	} else {
		try {
			const parsed = new URL(url)
			if (INTERNAL_HOSTS.test(parsed.hostname)) {
				path = parsed.pathname + parsed.search + parsed.hash
			}
		} catch {
			// not an absolute URL (e.g. mailto:, tel:) -> treat as external
		}
	}

	if (path === null) {
		return <a href={url}>{props.children}</a>
	}

	const [, basePath, rest] = path.match(/^([^?#]*)([?#].*)?$/)
	const lastSegment = basePath.split('/').pop()
	const needsSlash = basePath && !basePath.endsWith('/') && !lastSegment.includes('.')
	const href = (needsSlash ? `${basePath}/` : basePath) + (rest || '')
	return (
		<Link href={href} legacyBehavior={false}>
			{props.children}
		</Link>
	)
}

// Shared component overrides for every <TinaMarkdown> in the app, so markdown
// links keep the live stream alive on all editable pages.
export const markdownComponents = {
	a: MarkdownLink,
}
