// Single source of truth for the site's top-level navigation tabs. Used by the
// desktop header, the mobile swipe drawer, and the footer CD nav, so all three
// stay in sync — add a tab here and it shows up everywhere automatically.
export const NAV_ITEMS = [
	{ href: '/', label: 'Home' },
	{ href: '/listen', label: 'Listen' },
	{ href: '/schedule', label: 'Schedule' },
	{ href: '/explore', label: 'Explore' },
	{ href: '/blog', label: 'Blog' },
	{ href: '/archive', label: 'Archive' },
	{ href: '/contact', label: 'Contact' },
	{ href: '/about', label: 'About' },
]

// Artwork pool for the footer CD nav tiles. We cycle through these, so new nav
// items automatically get a CD image without anyone having to pick a new one.
export const CD_IMAGES = ['/CD_1_Filler.jpg', '/CD_2_Filler.jpg', '/CD_3_Filler.jpg']

// Pick a CD image for the nav item at the given index, wrapping around the pool.
export const cdImageFor = (index) => CD_IMAGES[index % CD_IMAGES.length]
