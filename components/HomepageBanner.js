import React, {useState} from 'react'
import {IoIosCloseCircle} from 'react-icons/io'
import logo from '../images/logo.png'
import {useAudio} from './AudioContext'

// The collage's outer columns are extras: the first column on each side always
// shows, the rest are `hidden lg:flex`. We still don't want phones downloading
// what they can never see (a `display:none` <img> downloads anyway), but the
// gate can't be JS anymore — see EXTRA_COLUMN_MEDIA below.
//
// This is deliberately looser than the `lg` (1024px) breakpoint those columns
// actually appear at: tablets fetch the extras without showing them. Four columns
// squeezed into a tablet width reads as cramped, but pre-fetching them means a
// rotate or resize up to desktop finds the images already there, and it keeps the
// fetch rule off the exact edge of the display rule. Phones (< 768px) still
// download nothing extra, which is the part worth protecting.
const EXTRA_COLUMN_MEDIA = '(min-width: 768px)'

// 1x1 transparent GIF. Inline, so "fetching" it costs nothing.
const BLANK_PIXEL =
	'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

// Soft fade on the collage's top and bottom edges, so the tiles dissolve into
// the page instead of ending on a hard line.
//
// The top fade's length is what makes it read as gradual rather than abrupt —
// but it's ALSO empty space at the top of the element, so it pushes the splash
// down. The two are only in tension if the element starts below the nav. It
// doesn't: pages/index.js pulls the collage up flush against the tabs with a
// negative margin, so this ramp fades in ACROSS that gap instead of on top of
// it. Keep the two in sync — lengthening the top stop without pulling further up
// just reintroduces the gap.
//
// `min(%, px)` on the top stops, rather than a bare percentage, is what keeps
// that tuning stable. The collage is viewport-height at `lg` (see the height
// classes below), so a plain 10% would grow with the window — a taller monitor
// would push the solid content further down and undo the alignment. The px terms
// cap the ramp at the length tuned against the old 45rem box (4% -> 29px,
// 10% -> 72px), while the percentages still win on small screens, where the
// collage is only 15rem tall and 72px would swallow a third of it.
//
// The bottom stop stays proportional on purpose: it fades into the page below,
// where there's nothing to stay aligned with.
//
// The extra 0.35-alpha stop early in the ramp eases the curve, so opacity
// arrives gently instead of hitting full black on a straight line.
const EDGE_FADE =
	'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.35) min(4%, 29px), black min(10%, 72px), black 90%, transparent 100%)'

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
	//
	// `extra` marks a tile in one of the `hidden lg:flex` outer columns. Those used
	// to be gated out of the DOM by a JS width check, which kept them off phones but
	// meant they only started downloading AFTER hydration — late enough that the
	// outer tiles were still blank when the page looked done. Instead we always
	// render them and let a <picture> media query decide what gets fetched: the
	// preload scanner evaluates <source media> before CSS or JS runs, so wide
	// viewports start these downloads with everything else, and narrow ones resolve
	// to an inline 1x1 and fetch nothing. Resizing across the breakpoint swaps the
	// source natively.
	const renderBannerImage = (item, imgIndex, {extra = false} = {}) => {
		const img = (
			<img
				src={extra ? BLANK_PIXEL : item.image}
				alt={item.alt || `Image ${imgIndex + 1}`}
				// The collage is the above-the-fold hero, so load eagerly — lazy
				// loading left visible edge tiles blank. decoding="async" still keeps
				// image decode off the main thread so the page stays responsive.
				decoding="async"
				className="w-full h-auto rounded-lg md:rounded-3xl"
			/>
		)

		const picture = extra ? (
			<picture>
				<source media={EXTRA_COLUMN_MEDIA} srcSet={item.image} />
				{img}
			</picture>
		) : (
			img
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
				{picture}
			</button>
		)
	}

	const midIndex = Math.floor(columns.length / 2)
	const leftColumns = columns.slice(0, midIndex)
	const rightColumns = columns.slice(midIndex)

	return (
		<div className="mx-auto mb-1 lg:mb-10 w-11/12 md:w-5/6 lg:w-full text-white">
			

			{/* Desktop height fills the initial landing view: the viewport minus
			    everything stacked above the collage. That's 120px / 7.5rem — the
			    fixed NavPlayer's 64px (cleared by Header's mt-16) plus the 56px nav
			    row (h-14); Header's mb-20 below it is cancelled by the -mt-20 on the
			    wrapper in pages/index.js. Adjust this if any of those three change.
			    Small screens keep fixed heights — mobile chrome makes 100vh
			    unreliable, and the collage isn't the whole first screen there. */}
			<div className="flex gap-2 md:gap-4 items-stretch h-[15rem] sm:h-[28rem] md:h-[26rem] lg:h-[calc(100vh-7.5rem)]">
				<div
					className="flex-1 flex gap-1 md:gap-4 overflow-hidden"
					style={{maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE}}
				>
					{leftColumns.map((column, colIndex) => {
						// colIndex > 0 columns are the extras — shown from `lg` up, but
						// fetched from `md` up (see EXTRA_COLUMN_MEDIA).
						const extra = colIndex > 0
						return (
							<div key={colIndex} className={`flex-1 flex flex-col gap-1 md:gap-3 ${extra ? 'hidden lg:flex' : ''}`}>
								{column.images?.map((item, imgIndex) => (
									<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl">
										{renderBannerImage(item, imgIndex, {extra})}
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
						maskImage: EDGE_FADE,
						WebkitMaskImage: EDGE_FADE,
					}}
				>
					{/* Top row: above-logo images, pinned to the bottom of this area (closest to logo) */}
					<div className="flex flex-col justify-end gap-1 md:gap-3 overflow-hidden">
						{aboveLogo.length > 0 && (
							<div className="flex gap-1 md:gap-3 w-full">
								{aboveLogo.map((column, colIndex) => (
									<div key={colIndex} className="flex-1 flex flex-col-reverse gap-1 md:gap-3">
										{column.images?.map((item, imgIndex) => (
											<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl">
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
											<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl">
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
					style={{maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE}}
				>
					{rightColumns.map((column, colIndex) => {
						// colIndex > 0 columns are the extras — shown from `lg` up, but
						// fetched from `md` up (see EXTRA_COLUMN_MEDIA).
						const extra = colIndex > 0
						return (
							<div key={colIndex} className={`flex-1 flex flex-col gap-1 md:gap-3 ${extra ? 'hidden lg:flex' : ''}`}>
								{column.images?.map((item, imgIndex) => (
									<div key={imgIndex} className="flex-shrink-0 overflow-hidden rounded-lg md:rounded-3xl">
										{renderBannerImage(item, imgIndex, {extra})}
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
