// Shared playlist presentation and the standard way to render a WXDU playlist:
// a show-info card (with an album-art grid pulled from the tracks) plus a dark
// track table. Used by /current (live) and /show (a finished show), and meant to
// be dropped into /listen next. The caller passes the already-rendered DJ
// link/name as `djNode` since /current links out to dj.link while /show links to
// /dj/?id=<id>.
//
// Album art is fetched lazily — after the table has painted — so playlist text
// shows instantly. Covers are deduped/cached by album so live polling on
// /current only fetches genuinely new albums. The grid and the table are wired
// together: clicking an album tile shimmers that album's rows, and clicking a
// row sparkles that album's tile. Rows and tiles are matched by the album key
// ("artist|album").

import { useEffect, useRef, useState } from 'react'
import getCovers from '../lib/getCovers'
import { fixEncoding } from '../lib/fixEncoding'
import AlbumArtGrid from './AlbumArtGrid'

function formatTime(unix) {
	if (!unix) return ''
	return new Date(unix * 1000).toLocaleTimeString([], {
		hour: 'numeric',
		minute: '2-digit',
	})
}

function formatDate(unix) {
	if (!unix) return ''
	return new Date(unix * 1000).toLocaleDateString([], {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	})
}

// A track's play time arrives as an ISO string (`songstart`), unlike the show's
// unix `starttime`. Render it in the same short clock format.
function formatTrackTime(songstart) {
	if (!songstart) return ''
	const d = new Date(songstart)
	if (Number.isNaN(d.getTime())) return ''
	return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

// The upstream `comments` field is a JSON-serialised Node Buffer
// ({ type: "Buffer", data: [...] }) — or occasionally a plain string. Decode to
// trimmed text, or null when empty. Mirrors normaliseComments in lib/nowPlaying.
function decodeComments(raw) {
	if (typeof raw === 'string') return fixEncoding(raw.trim()) || null
	if (raw && typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
		try {
			return fixEncoding(new TextDecoder().decode(new Uint8Array(raw.data)).trim()) || null
		} catch {
			return null
		}
	}
	return null
}

const albumKey = (t) => (t?.artist && t?.album ? `${t.artist}|${t.album}` : null)

// The fixed NavPlayer bar overlaps the top of the page; treat content beneath it
// as "off screen" and offset scroll targets so they aren't hidden under it.
const HEADER_OFFSET = 80
// Give a smooth scroll time to settle before playing the highlight animation.
const SCROLL_SETTLE_MS = 450

const isOnScreen = (el) => {
	if (!el) return false
	const r = el.getBoundingClientRect()
	return r.bottom > HEADER_OFFSET && r.top < window.innerHeight
}

const scrollRowToCenter = (el) => {
	el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const scrollElToTop = (el) => {
	if (!el) return
	const y = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET
	window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' })
}

export default function PlaylistView({ show, tracks, djNode, djName }) {
	// Untitled shows fall back to "<DJ name>'s show" (matching the DJ shown in
	// "with …" below); only when there's no DJ at all do we land on "Playlist".
	const showTitle =
		show?.title || show?.othergenre || (djName ? `${djName}'s show` : 'Playlist')
	const endTime = show?.duration ? show.starttime + show.duration * 3600 : null

	const visibleTracks = tracks?.filter((t) => t.artist !== '*****') ?? []

	// Only surface the comments column when this show actually has some.
	const hasComments = visibleTracks.some((t) => decodeComments(t.comments))

	// Deferred album-art lookup. coverCacheRef persists across renders/polls so a
	// given album is only fetched once; coverMap is the render-visible snapshot.
	const coverCacheRef = useRef(new Map())
	const [coverMap, setCoverMap] = useState(new Map())

	// Element refs so a click can scroll its counterpart into view first.
	const gridWrapperRef = useRef(null)
	const rowElsRef = useRef(new Map()) // rowId -> <tr> element

	useEffect(() => {
		let cancelled = false
		const cache = coverCacheRef.current

		// Unique album keys we haven't looked up yet.
		const pending = []
		const seen = new Set()
		for (const t of tracks ?? []) {
			if (t.artist === '*****') continue
			const key = albumKey(t)
			if (!key || seen.has(key)) continue
			seen.add(key)
			if (!cache.has(key)) pending.push({ key, artist: t.artist, album: t.album })
		}

		if (pending.length === 0) return

		;(async () => {
			const entries = await Promise.all(
				pending.map(async (p) => [p.key, await getCovers(p.artist, null, p.album)])
			)
			if (cancelled) return
			for (const [key, url] of entries) cache.set(key, url)
			setCoverMap(new Map(cache))
		})()

		return () => {
			cancelled = true
		}
	}, [tracks])

	// One tile per unique album that actually resolved a cover, in playlist order.
	const albums = []
	const seenAlbum = new Set()
	for (const t of visibleTracks) {
		const key = albumKey(t)
		if (!key || seenAlbum.has(key)) continue
		seenAlbum.add(key)
		const cover = coverMap.get(key)
		if (cover) albums.push({ key, cover, artist: t.artist, album: t.album })
	}

	// Brief, replayable highlight animations. The nonce changes every trigger so
	// re-clicking the same album restarts the animation (via React key remount).
	const [shimmer, setShimmer] = useState({ key: null, nonce: 0 })
	const [sparkle, setSparkle] = useState({ key: null, nonce: 0 })
	const shimmerTimer = useRef(null)
	const sparkleTimer = useRef(null)
	const deferShimmerTimer = useRef(null)
	const deferSparkleTimer = useRef(null)

	const triggerShimmer = (key) => {
		setShimmer((s) => ({ key, nonce: s.nonce + 1 }))
		if (shimmerTimer.current) clearTimeout(shimmerTimer.current)
		shimmerTimer.current = setTimeout(
			() => setShimmer((s) => ({ key: null, nonce: s.nonce })),
			2300
		)
	}

	const triggerSparkle = (key) => {
		setSparkle((s) => ({ key, nonce: s.nonce + 1 }))
		if (sparkleTimer.current) clearTimeout(sparkleTimer.current)
		sparkleTimer.current = setTimeout(
			() => setSparkle((s) => ({ key: null, nonce: s.nonce })),
			2300
		)
	}

	useEffect(
		() => () => {
			;[shimmerTimer, sparkleTimer, deferShimmerTimer, deferSparkleTimer].forEach(
				(r) => {
					if (r.current) clearTimeout(r.current)
				}
			)
		},
		[]
	)

	// Clicking an album tile: if none of that album's rows are on screen, scroll
	// the first one to the center of the viewport, then shimmer.
	const handleAlbumClick = (key) => {
		const els = []
		visibleTracks.forEach((t, i) => {
			if (albumKey(t) === key) {
				const el = rowElsRef.current.get(t.ID ?? i)
				if (el) els.push(el)
			}
		})

		if (els.length > 0 && !els.some(isOnScreen)) {
			scrollRowToCenter(els[0])
			if (deferShimmerTimer.current) clearTimeout(deferShimmerTimer.current)
			deferShimmerTimer.current = setTimeout(() => triggerShimmer(key), SCROLL_SETTLE_MS)
		} else {
			triggerShimmer(key)
		}
	}

	// Clicking a track row: if the album grid isn't on screen, scroll it to the
	// top of the viewport, then sparkle the album's tile.
	const handleRowClick = (key) => {
		const gridEl = gridWrapperRef.current
		if (gridEl && !isOnScreen(gridEl)) {
			scrollElToTop(gridEl)
			if (deferSparkleTimer.current) clearTimeout(deferSparkleTimer.current)
			deferSparkleTimer.current = setTimeout(() => triggerSparkle(key), SCROLL_SETTLE_MS)
		} else {
			triggerSparkle(key)
		}
	}

	return (
		<>
			{/* Show info + album grid */}
			<div className="mb-8 rounded-lg bg-neutral-900 px-6 py-5">
				<div className="flex flex-col gap-4 md:flex-row md:items-start">
					<div className="shrink-0 md:max-w-sm">
						<h2 className="kallisto text-2xl lg:text-3xl">{showTitle}</h2>
						{show?.subtitle && (
							<p className="mt-1 text-neutral-400 italic">{show.subtitle}</p>
						)}
						{djNode && (
							<p className="mt-2 text-lg text-neutral-300">with {djNode}</p>
						)}
						{show?.starttime && (
							<p className="mt-1 text-sm text-neutral-500">
								{formatDate(show.starttime)} &middot; {formatTime(show.starttime)}
								{endTime && <> &ndash; {formatTime(endTime)}</>}
							</p>
						)}
					</div>

					{albums.length > 0 && (
						<div ref={gridWrapperRef} className="w-full min-w-0 flex-1">
							<AlbumArtGrid
								albums={albums}
								onAlbumClick={handleAlbumClick}
								sparkleKey={sparkle.key}
								sparkleNonce={sparkle.nonce}
							/>
						</div>
					)}
				</div>
			</div>

			{/* Track list */}
			{visibleTracks.length === 0 ? (
				<p className="text-neutral-400">No tracks logged yet.</p>
			) : (
				// The negative margin + equal padding keep the table in place (aligned with the show-info card above) while extending this wrapper's box into the left page gutter, so the first/last tracks' play times render in that open black space instead of being clipped by overflow-x. Disabled on mobile, where the gutter is too narrow and the times are hidden.
				<div className="overflow-x-auto md:-ml-16 md:pl-16">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-neutral-700 text-neutral-400">
								<th className="pb-2 pr-6 font-normal">Artist</th>
								<th className="pb-2 pr-6 font-normal">Song</th>
								<th className="hidden pb-2 pr-6 font-normal md:table-cell">Album</th>
								<th className="hidden pb-2 pr-6 font-normal lg:table-cell">Label</th>
								<th className="hidden pb-2 pr-6 font-normal lg:table-cell">Req</th>
								{hasComments && (
									<th className="hidden pb-2 font-normal md:table-cell">Comments</th>
								)}
							</tr>
						</thead>
						<tbody>
							{visibleTracks.map((t, i) => {
								const key = albumKey(t)
								const base = t.ID ?? i
								const isShimmering = shimmer.key != null && key === shimmer.key
								// Show the play time, tucked into the open space left of the
								// table, for the first and last tracks of the show only.
								const showPlayTime = i === 0 || i === visibleTracks.length - 1
								const playTime = showPlayTime ? formatTrackTime(t.songstart) : ''
								const comment = hasComments ? decodeComments(t.comments) : null
								return (
									<tr
										key={isShimmering ? `${base}-${shimmer.nonce}` : base}
										ref={(el) => {
											if (el) rowElsRef.current.set(base, el)
											else rowElsRef.current.delete(base)
										}}
										onClick={key ? () => handleRowClick(key) : undefined}
										className={`border-b border-neutral-800 hover:bg-neutral-900 ${
											key ? 'cursor-pointer' : ''
										} ${isShimmering ? 'animate-shimmer' : ''}`}
									>
										<td className="relative py-2 pr-6">
											{playTime && (
												<span className="pointer-events-none absolute right-full top-1/2 hidden -translate-y-1/2 whitespace-nowrap pr-2 text-xs text-neutral-400 md:block">
													{playTime}
												</span>
											)}
											{t.artist}
										</td>
										<td className="py-2 pr-6">{t.song}</td>
										<td className="hidden py-2 pr-6 text-neutral-400 md:table-cell">
											{t.album}
										</td>
										<td className="hidden py-2 pr-6 text-neutral-400 lg:table-cell">
											{t.label}
										</td>
										<td className="hidden py-2 pr-6 text-neutral-500 lg:table-cell">
											{t.request ? 'R' : ''}
										</td>
										{hasComments && (
											<td className="hidden py-2 text-neutral-400 md:table-cell">
												{comment}
											</td>
										)}
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
		</>
	)
}
