// This component displayed the last played songs of the entire day.

import SongRow from './songRow'
import useRecentTracks from '@/hooks/useRecentTracks'
import {getApiBase} from 'lib/api'

export default function LastPlayed({currentPlaylist = {}}) {
	
	const {recentTracks, loading} = useRecentTracks(10);

	// returns a table like appearance using only divs
	// table is hidden for small screens like on mobile to rather just show a row.
	return (
		<section className="w-full">
			<div className="w-full md:min-w-[840px]">
				<div className="sticky top-0 z-50 bg-black pb-3 pt-1">
					<h4 className="text-center text-2xl font-light text-white">
						Last Played 10 Songs
					</h4>
				</div>
				<div role="table" aria-label="Last played songs" className="w-full">
					<div
						role="row"
						className="sticky top-12 z-40 hidden grid-cols-[128px_88px_minmax(140px,1fr)_minmax(180px,1.25fr)_minmax(140px,1fr)] gap-4 border-b border-zinc-700/90 bg-black px-2 pb-3 pt-1 text-sm text-sky-100 sm:px-3 md:grid"
					>
						<div role="columnheader" aria-label="Album cover" />
						<div role="columnheader">Time</div>
						<div role="columnheader">Artist</div>
						<div role="columnheader">Song</div>
						<div role="columnheader">Album</div>
					</div>

					{loading ? (
						<div
							role="row"
							className="px-1 py-5 text-sm text-zinc-400 md:grid md:grid-cols-[128px_88px_minmax(140px,1fr)_minmax(180px,1.25fr)_minmax(140px,1fr)] md:gap-4 md:px-3"
						>
							<p role="cell" className="md:col-span-5 text-center">
								Loading recent songs...
							</p>
						</div>
					) : recentTracks.length > 0 ? (
						recentTracks.map((item, i) => (
							<SongRow
								key={`${item.songstart || 'track'}-${i}`}
								song={item.song}
								artist={item.artist}
								album={item.album}
								songStart={item.songstart}
								cover={item.cover_url ? `${getApiBase()}${item.cover_url}` : null}
							/>
						))
					) : (
						<div
							role="row"
							className="px-1 py-5 text-sm text-zinc-400 md:grid md:grid-cols-[128px_88px_minmax(140px,1fr)_minmax(180px,1.25fr)_minmax(140px,1fr)] md:gap-4 md:px-3"
						>
							<p role="cell" className="md:col-span-5">
								No recent songs found.
							</p>
						</div>
					)}
				</div>
			</div>
		</section>
	)
}
