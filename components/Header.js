import React from 'react'
import Link from 'next/link'
import MobileNavDrawer from './MobileNavDrawer'
import SearchBar from './SearchBar'
import {NAV_ITEMS} from '../lib/navItems'

const Header = () => {
	return (
		//Parent Container
		<div className="h-full">
			{/* Mobile navigation: an edge-swipe drawer replaces the hamburger menu. */}
			<MobileNavDrawer />

			<div className="relative z-20">

				{/* Parent container of web navbar */}
				<div className="mb-20 hidden w-full lg:flex mt-16">
					{/* Actual navbar — transparent so the animated site background shows
					    through the tabs row (the fixed NavPlayer bar keeps its own bg). */}
					<div className="flex h-14 w-full flex-row justify-between px-1 py-4 ">
							{/* Home link (replaces the old WXDU logo) */}
							<div className="my-auto flex flex-row">
								<Link href="/" legacyBehavior={false} className="my-auto ml-10 flex h-12 items-center text-base text-white hover:text-blue-300">
									Come Home to WXDU
								</Link>
							</div>

						{/* Search — sits between the brand link and the nav tabs. */}
						<div className="my-auto flex flex-1 justify-center px-6">
							<SearchBar className="w-full max-w-xs" />
						</div>

						{/* Links (Home lives in the brand slot on the left) */}
						<div className="my-auto flex w-1/2 flex-row">
							{NAV_ITEMS.filter((item) => item.href !== '/').map((item) => (
								<Link
									key={item.href}
									href={item.href}
									legacyBehavior={false}
									className="flex h-12 grow items-center justify-center text-base text-white hover:text-blue-300"
								>
									{item.label}
								</Link>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

export default Header
