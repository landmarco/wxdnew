// This component displays each of the row for last played songs

import SongAlbumCover from './songAlbumCover'

export default function SongRow({
	song,
	artist,
	album,
	songStart,
	cover,
}) {
	function formatTime(iso) {
		if (!iso) return ''

		const date = new Date(iso)
		if (Number.isNaN(date.getTime())) return ''

		return date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})
	}

	const displayTime = formatTime(songStart)
	const displayArtist = artist || 'Unknown artist'
	const displaySong = song || 'Unknown song'
	const displayAlbum = album || 'Unknown album'

	return (
		<>
			{/* if the screen is small, it shows a row */}
			{/* MOBILE VIEW starts here */}
			<div
				role="row"
				className="grid min-h-[112px] grid-cols-[88px_minmax(0,1fr)] items-center gap-3 border-b border-dashed border-zinc-700/80 px-1 py-4 transition-colors hover:bg-white/[0.035] md:hidden"
			>
				<div role="cell" className="flex items-center self-start">
					<SongAlbumCover
						artist={displayArtist}
						album={displayAlbum}
						cover={cover}
						sizeClassName="h-20 w-20"
						className="shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
					/>
				</div>
				<div role="cell" className="min-w-0">
					<dl className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
						<dt className="text-[10px] uppercase leading-5 text-sky-100/60">
							Time
						</dt>
						<dd className="text-xs leading-5 text-sky-100/90">
							{displayTime || '-'}
						</dd>
						<dt className="text-[10px] uppercase leading-5 text-sky-100/60">
							Song
						</dt>
						<dd className="break-words font-bold leading-5 text-white">
							{displaySong}
						</dd>
						<dt className="text-[10px] uppercase leading-5 text-sky-100/60">
							Artist
						</dt>
						<dd className="break-words text-sm leading-5 text-zinc-300">
							{displayArtist}
						</dd>
						<dt className="text-[10px] uppercase leading-5 text-sky-100/60">
							Album
						</dt>
						<dd className="break-words text-xs leading-5 text-zinc-500">
							{displayAlbum}
						</dd>
					</dl>
				</div>
			</div>
			{/* MOBILE VIEW ends here */}

			{/* if the screen is md and above, it shows a table */}
			<div
				role="row"
				className="hidden min-h-[144px] grid-cols-[128px_88px_minmax(140px,1fr)_minmax(180px,1.25fr)_minmax(140px,1fr)] items-center gap-4 border-b border-dashed border-zinc-700/80 px-2 py-4 transition-colors hover:bg-white/[0.035] sm:px-3 md:grid"
			>
				<div role="cell" className="flex items-center">
					<SongAlbumCover
						artist={displayArtist}
						album={displayAlbum}
						cover={cover}
						sizeClassName="h-28 w-28"
						className="shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
					/>
				</div>
				<div role="cell" className="text-sm text-sky-100/90">
					{displayTime}
				</div>
				<div role="cell" className="min-w-0">
					<p className="truncate text-white">{displayArtist}</p>
				</div>
				<div role="cell" className="min-w-0">
					<p className="truncate font-bold text-white">{displaySong}</p>
				</div>
				<div role="cell" className="min-w-0">
					<p className="truncate text-zinc-300">{displayAlbum}</p>
				</div>
			</div>
		</>
	)
}
