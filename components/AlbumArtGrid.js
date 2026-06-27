// A compact grid of album covers pulled from a playlist's tracks — one tile per
// unique album. Clicking a tile asks the parent to highlight that album's rows;
// when the parent marks an album as the sparkle target, the matching tile briefly
// twinkles. Tiles and rows are matched by the album `key` ("artist|album").

const FILLER_IMAGE = '/CD_1_Filler.jpg'

// Positions for the sparkle elements drawn around a twinkling tile.
const SPARKLES = [
	{ top: '-6px', left: '-6px', delay: '0ms' },
	{ top: '-8px', right: '4px', delay: '120ms' },
	{ top: '50%', right: '-6px', delay: '240ms' },
	{ bottom: '-6px', left: '8px', delay: '180ms' },
	{ bottom: '-4px', right: '-4px', delay: '60ms' },
]

export default function AlbumArtGrid({ albums, onAlbumClick, sparkleKey, sparkleNonce }) {
	if (!albums || albums.length === 0) return null

	return (
		<div
			className="grid gap-1"
			style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}
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
						className="relative aspect-square overflow-visible rounded border-0 bg-transparent p-0 cursor-pointer transition-transform duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0ff05]"
					>
						<img
							src={album.cover || FILLER_IMAGE}
							alt={`${album.artist} - ${album.album}`}
							className="h-full w-full rounded object-cover"
						/>

						{sparkling && (
							<span key={sparkleNonce} className="pointer-events-none absolute inset-0" aria-hidden="true">
								{SPARKLES.map((s, i) => (
									<span
										key={i}
										className="animate-sparkle absolute text-[#e0ff05] text-xs leading-none drop-shadow"
										style={{
											top: s.top,
											left: s.left,
											right: s.right,
											bottom: s.bottom,
											animationDelay: s.delay,
										}}
									>
										✦
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
