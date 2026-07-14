import { useState, useEffect } from 'react'
import Link from 'next/link'
import { subscribeCurrentPlaylist } from '../lib/nowPlaying'
import { fixEncodingDeep } from '../lib/fixEncoding'
import PlaylistView from '../components/PlaylistView'

export default function CurrentPlaylist() {
	const [data, setData] = useState(null)
	const [offAir, setOffAir] = useState(false)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		// Live updates via the SSE stream (falls back to polling internally), so
		// newly logged tracks appear near-instantly instead of on a 30s timer.
		const unsubscribe = subscribeCurrentPlaylist((payload) => {
			if (payload && payload.show) {
				// Repair mojibake + HTML entities (e.g. 12&quot; -> 12") in every
				// track field, matching /show (useShowPlaylist) and NowPlayingHeader
				// (useCurrentPlaylist), which both run the payload through this.
				setData(fixEncodingDeep(payload))
				setOffAir(false)
			} else {
				setData(null)
				setOffAir(true)
			}
			setLoading(false)
		})
		return unsubscribe
	}, [])

	const { show, dj, tracks } = data ?? {}

	const djName = show?.djname || dj?.defdjname || 'WXDU'
	// Link the DJ name to their shows page, matching /show. djId comes off the
	// playlist payload (dj.ID), falling back to the show's userID.
	const djId = dj?.ID ?? show?.userID
	const djNode = djId ? (
		<Link
			href={`/dj/?id=${djId}`}
			legacyBehavior={false}
			className="underline hover:text-blue-300"
		>
			{djName}
		</Link>
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
				<PlaylistView show={show} tracks={tracks} djNode={djNode} djName={show?.djname || dj?.defdjname || null} />
			)}
		</div>
	)
}
