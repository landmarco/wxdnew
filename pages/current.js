import { useState, useEffect } from 'react'
import { apiFetch } from '../lib/api'
import PlaylistView from '../components/PlaylistView'

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

	const djName = show?.djname || dj?.defdjname || 'WXDU'
	const djNode = dj?.link ? (
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
	)

	return (
		<div className="mx-auto w-5/6 pb-16 text-white">
			<div className="mb-8 mt-4">
				<h1 className="kallisto text-4xl lg:text-5xl">Current Playlist</h1>
			</div>

			{loading && <p className="text-neutral-400">Loading...</p>}

			{!loading && offAir && (
				<div className="rounded-lg bg-neutral-900 px-8 py-12 text-center">
					<p className="kallisto text-2xl text-neutral-300">Off Air</p>
					<p className="mt-2 text-neutral-500">
						No show is currently active. Check back later.
					</p>
				</div>
			)}

			{!loading && data && (
				<PlaylistView show={show} tracks={tracks} djNode={djNode} />
			)}
		</div>
	)
}
