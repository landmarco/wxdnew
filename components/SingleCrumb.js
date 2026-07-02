import {Typography} from '@mui/material'
import Link from 'next/link'

// Each individual "crumb" in the breadcrumbs list
export default function Crumb({text, href, last = false}) {
	// Blog header on blog home page
	if (last && text === 'WXDU PRESS') { 
		// I changed 'WXYC PRESS' to 'WXDU PRESS' in BlogBreadcrumbs.js, so this condition will never be true. Should I change it to 'WXDU PRESS' here?
		// Does that break something?
		return null
	}
	// Blog header when you're not on blog home page (links back to blog home page)
	if (!last && text === 'WXDU PRESS') {
		return (
			<Link href={href} className="text-base text-white hover:underline md:text-2xl">
				{text}
			</Link>
		)
	}

	// Archive header on archive home page
	if (last && text === 'Archive') {
		return <h1 className="kallisto mb-4 text-5xl text-white">{text}</h1>
	}
	// Archive header when you're not on archive home page (links back to archive home page)
	if (!last && text === 'Archive') {
		return (
			<Link href={href} className="text-base text-white hover:underline md:text-2xl">
				{text}
			</Link>
		)
	}

	// when the crumb doesn't link anywhere (b/c it's category or ur currently on the page)
	if (last || text === 'Category') {
		return <Typography color="white">{text}</Typography>
	}

	// All other crumbs will be rendered as links that can be visited
	return (
		<Link href={href} className="text-white hover:underline">
			{text}
		</Link>
	)
}
