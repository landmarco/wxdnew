import {TinaMarkdown} from 'tinacms/dist/rich-text'
import {markdownComponents} from './markdownComponents'

// Wrapper around <TinaMarkdown> that always applies the shared markdown
// component overrides (notably the SiteLink-based `a` renderer that keeps the
// live stream alive). Use this instead of <TinaMarkdown> directly so new
// editable sections are stream-safe by default. Page-specific component
// overrides (e.g. a Tina template like `weeklySchedule`) can be passed via
// `components` and are merged on top of the shared defaults.
export default function RichText({content, components}) {
	return (
		<TinaMarkdown content={content} components={{...markdownComponents, ...components}} />
	)
}
