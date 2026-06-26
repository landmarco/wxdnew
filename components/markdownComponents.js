import SiteLink from './SiteLink'

// Component overrides shared by every <TinaMarkdown> in the app (applied
// automatically via the <RichText> wrapper). Markdown links render through
// SiteLink so internal links route client-side and keep the live stream alive.
// Tina passes the link target as `url`; SiteLink expects `href`.
export const markdownComponents = {
	a: (props) => <SiteLink href={props.url}>{props.children}</SiteLink>,
}
