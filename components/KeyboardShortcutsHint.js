import { useEffect, useRef } from 'react'

// Accessibility helper that lives as the first focusable element on the page.
// On the very first Tab press it reveals a small overlay listing the site-wide
// keyboard shortcuts, with the "Skip to main content" link at the bottom.
//
// It's driven purely by :focus-within (no JS state, so it works before hydration
// and needs no scroll lock — the page stays scrollable while it's showing). The
// panel is translated off-screen when unfocused but stays in the tab order, so
// the skip link inside it is what the first Tab lands on.
//
// The shortcuts here mirror the global hotkeys registered in AudioContext.js
// (k / r / e) and ModalContext.js (p / f). "s" is registered below and summons
// this very panel.
const SHORTCUTS = [
	{ keys: ['S'], description: 'summon this shortcut popup' },
	{ keys: ['K'], description: 'play / pause the stream' },
	{ keys: ['R'], description: 'resync to the live stream' },
	{ keys: ['P'], description: 'phone in a request' },
	{ keys: ['F'], description: 'send us feedback' },
	{ keys: ['E'], description: 'receive / return a beautiful & alluring emerald' },
]

export default function KeyboardShortcutsHint() {
	const containerRef = useRef(null)
	const skipLinkRef = useRef(null)

	// Global hotkey: "s" toggles this panel. It's :focus-within-driven, so we
	// just move focus in or out of it — summoning it puts focus on the skip link
	// (same state the first Tab press produces); dismissing it blurs whatever
	// inside currently holds focus. Ignored while typing in a field or holding a
	// modifier so it never hijacks text entry or browser shortcuts.
	useEffect(() => {
		const handleKeyDown = (event) => {
			if (event.key.toLowerCase() !== 's') return
			if (event.metaKey || event.ctrlKey || event.altKey) return
			const el = event.target
			const tag = el?.tagName
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
			event.preventDefault()
			if (containerRef.current?.contains(document.activeElement)) {
				document.activeElement.blur()
			} else {
				skipLinkRef.current?.focus()
			}
		}

		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [])

	return (
		<div ref={containerRef} className="pointer-events-none fixed left-4 top-4 z-[100] w-80 max-w-[calc(100vw-2rem)] -translate-y-[130%] opacity-0 transition-all duration-200 focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100">
			<div
				role="region"
				aria-label="Keyboard shortcuts"
				className="rounded-lg border border-[#e0ff05]/50 bg-black/95 p-4 text-white shadow-lg shadow-black/40 backdrop-blur-sm"
			>
				<h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-[#e0ff05]">
					Keyboard shortcuts
				</h2>
				<ul className="mb-4 space-y-2 text-sm">
					{SHORTCUTS.map((shortcut) => (
						<li key={shortcut.description} className="flex items-center justify-between gap-4">
							<span>{shortcut.description}</span>
							<span className="flex shrink-0 gap-1">
								{shortcut.keys.map((key) => (
									<kbd
										key={key}
										className="rounded border border-zinc-500 bg-zinc-800 px-2 py-0.5 font-mono text-xs text-white"
									>
										{key}
									</kbd>
								))}
							</span>
						</li>
					))}
				</ul>
				<a
					ref={skipLinkRef}
					href="#main-content"
					className="block rounded bg-[#e0ff05] px-3 py-2 text-center text-sm font-semibold text-black transition-colors hover:bg-[#e0ff05]/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
				>
					skip to main content
				</a>
			</div>
		</div>
	)
}
