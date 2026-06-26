import Link from 'next/link'

// Canonical link component for the whole site. Prefer this over a raw `next/link`
// or `<a>` for any new link so navigation stays safe by default:
//   - internal links route client-side (Next <Link>), which keeps the live audio
//     stream alive instead of doing a full page reload;
//   - internal paths get a trailing slash (before any ?query/#hash) to match
//     `trailingSlash: true`, otherwise the static export redirects and the click
//     becomes a hard navigation;
//   - absolute links to our own domains (wxdu.art / wxdu.org) are normalised to a
//     relative path so they work on any host (localhost included);
//   - external / mailto: / tel: links render as plain anchors.
// Extra props (className, onClick, rel, target, aria-*, …) are forwarded.

// Hostnames that are "us" — absolute links to these are really internal.
const INTERNAL_HOSTS = /(^|\.)wxdu\.(art|org)$/i

// Returns an internal path ("/...") for internal links, or null if external.
function toInternalPath(href) {
	if (typeof href !== 'string' || !href) return null
	if (href.startsWith('/')) return href
	try {
		const parsed = new URL(href)
		if (INTERNAL_HOSTS.test(parsed.hostname)) {
			return parsed.pathname + parsed.search + parsed.hash
		}
	} catch {
		// not an absolute URL (e.g. mailto:, tel:) -> treat as external
	}
	return null
}

export default function SiteLink({href, children, ...rest}) {
	const path = toInternalPath(href)

	if (path === null) {
		return (
			<a href={href} {...rest}>
				{children}
			</a>
		)
	}

	const [, basePath, suffix] = path.match(/^([^?#]*)([?#].*)?$/)
	const lastSegment = basePath.split('/').pop()
	const needsSlash = basePath && !basePath.endsWith('/') && !lastSegment.includes('.')
	const normalized = (needsSlash ? `${basePath}/` : basePath) + (suffix || '')

	return (
		<Link href={normalized} legacyBehavior={false} {...rest}>
			{children}
		</Link>
	)
}
