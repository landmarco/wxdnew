// A compact grid of album covers pulled from a playlist's tracks — one tile per
// unique album. Clicking a tile asks the parent to highlight that album's rows;
// when the parent marks an album as the sparkle target, the matching tile briefly
// twinkles. Tiles and rows are matched by the album `key` ("artist|album").

import { useMemo } from 'react'

const FILLER_IMAGE = '/CD_1_Filler.jpg'

// Glyphs the twinkle draws from; each sparkle picks one at random.
const SPARKLE_GLYPHS = ['✦', '✧', '✶', '✸', '★', '❋']

// One sparkle at the given tile-relative position (percentages), with randomized
// size, delay and glyph. Sizes use cqw (a share of the tile's width) so the
// effect scales with the tiles however big they get.
function makeSparkle(top, left) {
	return {
		top: `${Math.round(top)}%`,
		left: `${Math.round(left)}%`,
		size: `${(14 + Math.random() * 16).toFixed(1)}cqw`, // ~14–30% of tile width
		delay: `${Math.round(Math.random() * 400)}ms`,
		glyph: SPARKLE_GLYPHS[Math.floor(Math.random() * SPARKLE_GLYPHS.length)],
	}
}

// Build a fresh, randomized set of sparkles so no two twinkles look the same.
// Some are guaranteed to sit in the clear space just above and below the art
// (where they stay legible over busy covers); the rest scatter over and around
// the tile.
function makeSparkles() {
	const sparkles = []

	// 1–2 in the dark band above, and 1–2 below, spread across the art's width.
	for (const above of [true, false]) {
		const count = 1 + Math.floor(Math.random() * 2)
		for (let i = 0; i < count; i++) {
			const top = above ? -(10 + Math.random() * 20) : 110 + Math.random() * 20
			sparkles.push(makeSparkle(top, 10 + Math.random() * 80))
		}
	}

	// 2–4 more scattered over and around the art (some spilling past the edges).
	const overCount = 2 + Math.floor(Math.random() * 3)
	for (let i = 0; i < overCount; i++) {
		sparkles.push(makeSparkle(Math.random() * 120 - 10, Math.random() * 120 - 10))
	}

	return sparkles
}

export default function AlbumArtGrid({ albums, onAlbumClick, sparkleKey, sparkleNonce }) {
	// One randomized pattern per trigger (the nonce changes on every click),
	// reused by whichever tile is currently sparkling. sparkleNonce is the cache
	// key on purpose even though makeSparkles doesn't read it.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const sparkles = useMemo(() => makeSparkles(), [sparkleNonce])

	if (!albums || albums.length === 0) return null

	return (
		<div
			className="grid gap-1"
			style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(123px, 1fr))' }}
		>
			{albums.map((album) => {
				const sparkling = sparkleKey === album.key
				return (
					<button
						key={album.key}
						type="button"
						onClick={() => onAlbumClick(album.key)}
						aria-label={`Highlight tracks from ${album.album}`}
						title={`${album.artist} — ${album.album}`}
						// Make the tile a query container so sparkles can size in cqw.
						style={{ containerType: 'inline-size' }}
						className="relative aspect-square overflow-visible rounded border-0 bg-transparent p-0 cursor-pointer transition-transform duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0ff05]"
					>
						<img
							src={album.cover || FILLER_IMAGE}
							alt={`${album.artist} - ${album.album}`}
							className="h-full w-full rounded object-cover"
						/>

						{sparkling && (
							<span key={sparkleNonce} className="pointer-events-none absolute inset-0" aria-hidden="true">
								{sparkles.map((s, i) => (
									<span
										key={i}
										className="absolute -translate-x-1/2 -translate-y-1/2"
										style={{ top: s.top, left: s.left }}
									>
										<span
											className="animate-sparkle block leading-none text-[#e0ff05] drop-shadow"
											style={{ fontSize: s.size, animationDelay: s.delay }}
										>
											{s.glyph}
										</span>
									</span>
								))}
							</span>
						)}
					</button>
				)
			})}
		</div>
	)
}
