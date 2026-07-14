// Mobile-only in-flow bar at the very top of the page content, just under the
// fixed "STREAM HERE" player bar. Holds the hamburger (opens the left nav
// drawer) and the search box. Rendered in normal flow (not fixed) so it scrolls
// away with the page. Hidden at lg+, where the desktop navbar takes over.
import { FiMenu } from 'react-icons/fi'
import SearchBar from './SearchBar'
import { useNavDrawer } from './NavDrawerContext'

const MobileTopBar = () => {
	const { open } = useNavDrawer()

	return (
		<div className="flex items-center gap-3 px-4 py-3 lg:hidden">
			<button
				type="button"
				onClick={() => open('left')}
				aria-label="Open menu"
				className="shrink-0 rounded-md border border-[#e0ff05]/50 p-2 text-[#e0ff05] transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0ff05]"
			>
				<FiMenu size={22} />
			</button>
			<SearchBar className="flex-1" placeholder="Search…" />
		</div>
	)
}

export default MobileTopBar
