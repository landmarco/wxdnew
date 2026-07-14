// Mobile navigation drawer. It can be opened by the hamburger button (see
// MobileTopBar) or by a horizontal swipe across the screen (swipe right opens
// the left panel, swipe left opens the right panel). The open-swipe deliberately
// ignores the very edges of the screen so it doesn't fight the browser's
// back/forward gesture, and it ignores swipes that start on horizontally-
// scrollable content (carousels, the schedule grid) so those keep scrolling
// normally. The panel follows the finger on a dismiss swipe, and can also be
// closed by tapping the backdrop or Escape.
//
// Open/close state lives in NavDrawerContext so the hamburger trigger (rendered
// elsewhere in the tree) shares it; the finger-follow drag state stays local.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Router } from 'next/router'
import { NAV_ITEMS } from '../lib/navItems'
import { useNavDrawer } from './NavDrawerContext'

// Only run the mobile drawer below Tailwind's lg breakpoint (the desktop navbar
// takes over at lg).
const LG_BREAKPOINT = 1024
// Swipes that start this close to either screen edge are left to the browser's
// own back/forward gesture — our open-swipe is a mid-screen swipe instead.
const EDGE_IGNORE = 24
// Horizontal travel needed to trigger open / to commit a dismiss.
const OPEN_THRESHOLD = 70
const CLOSE_FRACTION = 0.33

// Walk up from the touch target: if any ancestor can scroll horizontally, this
// swipe is meant to scroll that content (a carousel, the schedule grid), not to
// open the menu, so we bow out.
function startedOnHorizontalScroller(node) {
	let el = node
	while (el && el !== document.body) {
		if (el.scrollWidth > el.clientWidth) {
			const overflowX = window.getComputedStyle(el).overflowX
			if (overflowX === 'auto' || overflowX === 'scroll') return true
		}
		el = el.parentElement
	}
	return false
}

const MobileNavDrawer = () => {
	const { openSide, open, close } = useNavDrawer()

	// live finger offset (px) during a dismiss drag; 0 when not dragging
	const [dragPx, setDragPx] = useState(0)
	const [dragging, setDragging] = useState(false)
	const dismissRef = useRef({ x: 0, tracking: false })

	// Close the drawer and clear any in-progress dismiss drag.
	const closeDrawer = () => {
		close()
		setDragPx(0)
		setDragging(false)
	}

	// Horizontal-swipe detection to OPEN the drawer. Listens on the document so a
	// swipe anywhere on the page counts, but ignores swipes that start at the very
	// edge (browser back/forward), start on horizontally-scrollable content, or
	// turn out to be vertical scrolls. Swipe right opens the left panel; swipe
	// left opens the right panel.
	useEffect(() => {
		if (openSide) return

		let startX = 0
		let startY = 0
		let active = false

		const onStart = (event) => {
			if (window.innerWidth >= LG_BREAKPOINT) return
			const touch = event.touches[0]
			startX = touch.clientX
			startY = touch.clientY
			// Skip the browser's edge back/forward zone and content that scrolls
			// sideways on its own.
			if (startX <= EDGE_IGNORE || startX >= window.innerWidth - EDGE_IGNORE) {
				active = false
				return
			}
			active = !startedOnHorizontalScroller(event.target)
		}

		const onMove = (event) => {
			if (!active) return
			const touch = event.touches[0]
			const dx = touch.clientX - startX
			const dy = touch.clientY - startY
			// abandon if the gesture is clearly a vertical scroll
			if (Math.abs(dy) > Math.abs(dx)) {
				active = false
				return
			}
			if (dx > OPEN_THRESHOLD) {
				open('left')
				active = false
			} else if (dx < -OPEN_THRESHOLD) {
				open('right')
				active = false
			}
		}

		const onEnd = () => {
			active = false
		}

		document.addEventListener('touchstart', onStart, { passive: true })
		document.addEventListener('touchmove', onMove, { passive: true })
		document.addEventListener('touchend', onEnd, { passive: true })
		document.addEventListener('touchcancel', onEnd, { passive: true })
		return () => {
			document.removeEventListener('touchstart', onStart)
			document.removeEventListener('touchmove', onMove)
			document.removeEventListener('touchend', onEnd)
			document.removeEventListener('touchcancel', onEnd)
		}
	}, [openSide, open])

	// Lock body scroll while the drawer is open.
	useEffect(() => {
		if (!openSide) return
		const previous = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = previous
		}
	}, [openSide])

	// Close on navigation and on Escape.
	useEffect(() => {
		const onRoute = () => closeDrawer()
		Router.events.on('routeChangeStart', onRoute)
		return () => Router.events.off('routeChangeStart', onRoute)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		if (!openSide) return
		const onKey = (event) => {
			if (event.key === 'Escape') closeDrawer()
		}
		document.addEventListener('keydown', onKey)
		return () => document.removeEventListener('keydown', onKey)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [openSide])

	// Dismiss-drag handlers for the open panel. The panel only follows the finger
	// in the closing direction; releasing past a third of its width commits.
	const dismissHandlers = (side) => ({
		onTouchStart: (event) => {
			dismissRef.current = { x: event.touches[0].clientX, tracking: true }
			setDragging(true)
		},
		onTouchMove: (event) => {
			if (!dismissRef.current.tracking) return
			const dx = event.touches[0].clientX - dismissRef.current.x
			setDragPx(side === 'right' ? Math.max(0, dx) : Math.min(0, dx))
		},
		onTouchEnd: () => {
			dismissRef.current.tracking = false
			setDragging(false)
			const threshold = window.innerWidth * 0.75 * CLOSE_FRACTION
			const travelled = side === 'right' ? dragPx : -dragPx
			if (travelled > threshold) closeDrawer()
			else setDragPx(0)
		},
	})

	const panelTransform = (side) => {
		if (openSide === side) return `translateX(${dragPx}px)`
		return side === 'right' ? 'translateX(100%)' : 'translateX(-100%)'
	}

	const renderPanel = (side) => (
		<nav
			aria-label="Main menu"
			aria-hidden={openSide !== side}
			{...(openSide === side ? dismissHandlers(side) : {})}
			className={`pointer-events-auto fixed top-0 z-[70] flex h-full w-3/4 max-w-xs flex-col gap-2 bg-black/95 px-8 pt-24 backdrop-blur-md lg:hidden ${
				side === 'right' ? 'right-0 border-l' : 'left-0 border-r'
			} border-[#e0ff05]/40`}
			style={{
				transform: panelTransform(side),
				transition: dragging ? 'none' : 'transform 250ms ease',
			}}
		>
			{NAV_ITEMS.map((item) => (
				<Link
					key={item.href}
					href={item.href}
					legacyBehavior={false}
					onClick={closeDrawer}
					tabIndex={openSide === side ? 0 : -1}
					className="py-3 text-3xl text-white hover:text-blue-300"
				>
					{item.label}
				</Link>
			))}
		</nav>
	)

	return (
		<div className="lg:hidden">
			{/* Backdrop — tap to close, or swipe in the closing direction (the same
			    gesture, and same handlers, as dragging the panel itself) so a swipe
			    that starts outside the drawer dismisses it too. */}
			<div
				onClick={closeDrawer}
				aria-hidden="true"
				{...(openSide ? dismissHandlers(openSide) : {})}
				className={`fixed inset-0 z-[60] bg-black/60 transition-opacity duration-200 ${
					openSide ? 'opacity-100' : 'pointer-events-none opacity-0'
				}`}
			/>

			{renderPanel('left')}
			{renderPanel('right')}
		</div>
	)
}

export default MobileNavDrawer
