import React, {useState, useEffect} from 'react'
import {IoIosCloseCircle} from 'react-icons/io'
import logo from '../images/logo.png'
import {useAudio} from './AudioContext'

// Returns true once the viewport is at least `px` wide. Starts false on the
// server and on first client render (so SSR/hydration match), then flips after
// mount. We use it to keep the mobile-hidden collage columns OUT of the DOM on
// small screens — a `display:none` <img> still downloads, so phones would
// otherwise pay for images they never see. Tailwind's `lg` breakpoint = 1024px.
const useMinWidth = (px) => {
	const [matches, setMatches] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia(`(min-width: ${px}px)`)
		const update = () => setMatches(mq.matches)
		update()
		mq.addEventListener('change', update)
		return () => mq.removeEventListener('change', update)
	}, [px])
	return matches
}

const Banner = ({columns = [], aboveLogo = [], belowLogo = []}) => {
	const [isClosed, setIsClosed] = useState(false)
	const {isPlaying, isHighQuality, togglePlayPause, setHighQuality} = useAudio()

	// The center WXDU logo is a play/stop control that also guarantees the 320 kbps
	// stream (and thus the header/footer emerald): stopped -> start in 320 (upgrading
	// from 192 mid-switchover if needed, via setHighQuality); already 320 & stopped ->
	// just start; playing -> stop. The surrounding collage tiles keep the plain
	// play/pause toggle (renderBannerImage below).
	const handleLogoClick = () => {
		if (isPlaying || isHighQuality) togglePlayPause()
		else setHighQuality(true, {startIfStopped: true})
	}
	// Extra collage columns are `hidden lg:flex` (desktop-only). Gate their actual
	// rendering on this so mobile never downloads them; see useMinWidth above.
	const isDesktop = useMinWidth(1024)

	if (isClosed || columns.length === 0) {
		return null
	}

	// Render a banner image. Every image doubles as a stream play/pause control
	// for mouse users. It's kept OUT of the keyboard tab order (tabIndex={-1})
	// and hidden from assistive tech (aria-hidden) on purpose: the collage is a
	// decorative hero, and the center WXDU logo below is the single, labeled
	// play/pause control that keyboard + screen-reader users get. That lets
	// tabbing jump header nav -> WXDU logo -> the page's main content without
	// stepping through every banner image.
	// TODO: eventually link each image to where it came from (the blog post,
	// event, etc.) instead of defaulting to the stream toggle.
	const renderBannerImage = (item, imgIndex) => {
		const img = (
			<img
				src={item.image}
				alt={item.alt || `Image ${imgIndex + 1}`}
				// The collage is the above-the-fold hero, so load eagerly — lazy
				// loading left visible edge tiles blank. decoding="async" still keeps
				// image decode off the main thread so the page stays responsive.
				// (The mobile-hidden columns don't render at all — see isDesktop below —
				// so phones still avoid downloading what they can't see.)
				decoding="async"
				className="w-full h-auto rounded-lg md:rounded-3xl"
			/>
		)

		return (
			<button
				type="button"
				onClick={togglePlayPause}
				tabIndex={-1}
				aria-hidden="true"
				title={isPlaying ? 'Pause stream' : 'Play stream'}
				className="block w-full cursor-pointer border-0 bg-transparent p-0"
			>
				{img}
			</button>
		)
	}

	const midIndex = Math.floor(columns.length / 2)
	const leftColumns = columns.slice(0, midIndex)
	const rightColumns = columns.slice(midIndex)

	return (
		<div className="mx-auto mb-1 lg:mb-10 w-11/12 md:w-5/6 lg:w-full text-white">
			

			<div className="flex gap-2 md:gap-4 items-stretch h-[15rem] sm:h-[28rem] md:h-[26rem] lg:h-[45rem]">
				<div
					className="flex-1 flex gap-1 md:gap-4 overflow-hidden"
					style={{
						maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
						WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
					}}
				>
					{leftColumns.map((column, colIndex) => {
						// colIndex > 0 columns are desktop-only; don't render (or download) on mobile.
						if (colIndex > 0 && !isDesktop) return null
						return (
							<div key={colIndex} className={`flex-1 flex flex-col gap-1 md:gap-3 ${colIndex > 0 ? 'hidden lg:flex' : ''}`}>
								{column.images?.map((item, imgIndex) => (
									<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl bg-neutral-800">
										{renderBannerImage(item, imgIndex)}
									</div>
								))}
							</div>
						)
					})}
				</div>

				<div
					className="flex-none w-[55%] md:w-[55%] lg:w-[45%] grid overflow-hidden"
					style={{
						gridTemplateRows: '1fr auto 1fr',
						maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
						WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
					}}
				>
					{/* Top row: above-logo images, pinned to the bottom of this area (closest to logo) */}
					<div className="flex flex-col justify-end gap-1 md:gap-3 overflow-hidden">
						{aboveLogo.length > 0 && (
							<div className="flex gap-1 md:gap-3 w-full">
								{aboveLogo.map((column, colIndex) => (
									<div key={colIndex} className="flex-1 flex flex-col-reverse gap-1 md:gap-3">
										{column.images?.map((item, imgIndex) => (
											<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl bg-neutral-800">
												{renderBannerImage(item, imgIndex)}
											</div>
										))}
									</div>
								))}
							</div>
						)}
					</div>

					{/* Middle row: logo + subheader, always fixed at the true center */}
					<div className="flex flex-col items-center py-2 px-2 lg:px-4 my-3 lg:my-6 rounded-3xl bg-black/80 shadow-lg shadow-black/20">
						<button
							type="button"
							onClick={handleLogoClick}
							aria-label={isPlaying ? 'Pause WXDU stream' : isHighQuality ? 'Play WXDU stream' : 'Play WXDU stream in 320 kbps'}
							title={isPlaying ? 'Pause stream' : isHighQuality ? 'Play stream' : 'Play stream in 320 kbps'}
							className="w-full cursor-pointer border-0 bg-transparent p-0"
						>
							<img src={logo.src} alt="WXDU Logo" className="w-full h-auto object-contain" />
						</button>
						<h1 className="courier-prime w-full text-center text-[0.6rem] sm:text-xs md:text-lg lg:text-3xl mt-2 leading-tight md:leading-normal">
							Duke and Durham&#39;s alternative, non-commercial radio station
						</h1>
					</div>

					{/* Bottom row: below-logo images, pinned to the top of this area (closest to logo) */}
					<div className="flex flex-col gap-1 md:gap-3 overflow-hidden">
						{belowLogo.length > 0 && (
							<div className="flex gap-1 md:gap-3 w-full">
								{belowLogo.map((column, colIndex) => (
									<div key={colIndex} className="flex-1 flex flex-col gap-1 md:gap-3">
										{column.images?.map((item, imgIndex) => (
											<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl bg-neutral-800">
												{renderBannerImage(item, imgIndex)}
											</div>
										))}
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				<div
					className="flex-1 flex gap-1 md:gap-4 overflow-hidden"
					style={{
						maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
						WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 90%, transparent 100%)',
					}}
				>
					{rightColumns.map((column, colIndex) => {
						// colIndex > 0 columns are desktop-only; don't render (or download) on mobile.
						if (colIndex > 0 && !isDesktop) return null
						return (
							<div key={colIndex} className={`flex-1 flex flex-col gap-1 md:gap-3 ${colIndex > 0 ? 'hidden lg:flex' : ''}`}>
								{column.images?.map((item, imgIndex) => (
									<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl bg-neutral-800">
										{renderBannerImage(item, imgIndex)}
									</div>
								))}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}

export default Banner
