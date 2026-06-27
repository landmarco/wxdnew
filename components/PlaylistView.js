// Shared playlist presentation: a show-info card plus a dark track table.
// Used by /current (live) and /show (a single finished show) so both render
// identically. The caller passes the already-rendered DJ link/name as `djNode`
// since /current links out to dj.link while /show links to /dj/?id=<id>.

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

export default function PlaylistView({ show, tracks, djNode }) {
	const showTitle = show?.title || show?.othergenre || 'Playlist'
	const endTime = show?.duration ? show.starttime + show.duration * 3600 : null

	const visibleTracks = tracks?.filter((t) => t.artist !== '*****') ?? []

	return (
		<>
			{/* Show info */}
			<div className="mb-8 rounded-lg bg-neutral-900 px-6 py-5">
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

			{/* Track list */}
			{visibleTracks.length === 0 ? (
				<p className="text-neutral-400">No tracks logged yet.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b border-neutral-700 text-neutral-400">
								<th className="pb-2 pr-6 font-normal">Artist</th>
								<th className="pb-2 pr-6 font-normal">Song</th>
								<th className="hidden pb-2 pr-6 font-normal md:table-cell">Album</th>
								<th className="hidden pb-2 pr-6 font-normal lg:table-cell">Label</th>
								<th className="hidden pb-2 font-normal lg:table-cell">Req</th>
							</tr>
						</thead>
						<tbody>
							{visibleTracks.map((t, i) => (
								<tr
									key={t.ID ?? i}
									className="border-b border-neutral-800 hover:bg-neutral-900"
								>
									<td className="py-2 pr-6">{t.artist}</td>
									<td className="py-2 pr-6">{t.song}</td>
									<td className="hidden py-2 pr-6 text-neutral-400 md:table-cell">
										{t.album}
									</td>
									<td className="hidden py-2 pr-6 text-neutral-400 lg:table-cell">
										{t.label}
									</td>
									<td className="hidden py-2 text-neutral-500 lg:table-cell">
										{t.request ? 'R' : ''}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</>
	)
}
