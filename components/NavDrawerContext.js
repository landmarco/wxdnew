// Shared open/close state for the mobile nav drawer. Lifted into a context so
// the drawer itself (MobileNavDrawer) and the trigger that opens it (the
// hamburger button in MobileTopBar) can live in different parts of the tree and
// still coordinate. Swipe-to-open, Escape, and route changes all flow through
// the same open()/close() here.
import { createContext, useCallback, useContext, useState } from 'react'

const NavDrawerContext = createContext({
	openSide: null,
	open: () => {},
	close: () => {},
})

export function NavDrawerProvider({ children }) {
	// which edge's panel is open: 'left' | 'right' | null
	const [openSide, setOpenSide] = useState(null)

	const open = useCallback((side) => setOpenSide(side), [])
	const close = useCallback(() => setOpenSide(null), [])

	return (
		<NavDrawerContext.Provider value={{ openSide, open, close }}>
			{children}
		</NavDrawerContext.Provider>
	)
}

export function useNavDrawer() {
	return useContext(NavDrawerContext)
}
