import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'

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

export default function CurrentPlaylist() {
	const [data, setData] = useState(null)
	const [offAir, setOffAir] = useState(false)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		async function load() {
			try {
				const result = await apiFetch('/api/playlists/current')
				setData(result)
				setOffAir(false)
			} catch {
				setData(null)
				setOffAir(true)
			} finally {
				setLoading(false)
			}
		}

		load()
		const interval = setInterval(load, 30_000)
		return () => clearInterval(interval)
	}, [])

	const { show, dj, tracks } = data ?? {}

	const showTitle = show?.title || show?.othergenre || 'On Air'
	const djName = show?.djname || dj?.defdjname || 'WXDU'
	const endTime = show ? show.starttime + show.duration * 3600 : null

	const visibleTracks = tracks?.filter((t) => t.artist !== '*****') ?? []

	return (
		<div className="mx-auto w-5/6 pb-16 text-white">
				<div className="mb-8 mt-4">
					<h1 className="kallisto text-4xl lg:text-5xl">Current Playlist</h1>
				</div>

				{loading && (
					<p className="text-neutral-400">Loading...</p>
				)}

				{!loading && offAir && (
					<div className="rounded-lg bg-neutral-900 px-8 py-12 text-center">
						<p className="kallisto text-2xl text-neutral-300">Off Air</p>
						<p className="mt-2 text-neutral-500">
							No show is currently active. Check back later.
						</p>
					</div>
				)}

				{!loading && data && (
					<>
						{/* Show info */}
						<div className="mb-8 rounded-lg bg-neutral-900 px-6 py-5">
							<h2 className="kallisto text-2xl lg:text-3xl">{showTitle}</h2>
							{show?.subtitle && (
								<p className="mt-1 text-neutral-400 italic">{show.subtitle}</p>
							)}
							<p className="mt-2 text-lg text-neutral-300">
								with{' '}
								{dj?.link ? (
									<a
										href={dj.link}
										target="_blank"
										rel="noopener noreferrer"
										className="underline hover:text-blue-300"
									>
										{djName}
									</a>
								) : (
									djName
								)}
							</p>
							<p className="mt-1 text-sm text-neutral-500">
								{formatDate(show.starttime)} &middot; {formatTime(show.starttime)}
								{endTime && <> &ndash; {formatTime(endTime)}</>}
							</p>
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
										{visibleTracks.map((t) => (
											<tr
												key={t.ID}
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
				)}
			</div>
	)
}
