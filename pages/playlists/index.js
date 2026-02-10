import React, {useMemo} from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import PlaylistTable from '../../components/PlaylistTable'

const fetcher = (url) => fetch(url).then((r) => r.json())

function Section({title, children}) {
	return (
		<section className="mb-10">
			<h2 className="kallisto mb-4 text-3xl text-white">{title}</h2>
			<div className="rounded border border-white/20 bg-black/60 p-4 shadow-lg">
				{children}
			</div>
		</section>
	)
}

function CurrentPlaylist() {
	const {data, error} = useSWR('/api/playlists/current', fetcher, {refreshInterval: 30000})
	if (error) return <p>Error loading current playlist.</p>
	if (!data) return <p>Loading…</p>
	const {show, tracks, columns} = data
	return (
		<div>
			<p className="mb-1 text-lg font-semibold">{show.title || show.othergenre}</p>
			<p className="mb-3 text-sm text-gray-300">with {show.djname}</p>
			<PlaylistTable tracks={tracks} columns={columns.filter((c) => c !== 'showID' && c !== 'orderkey')} />
		</div>
	)
}

function LastTen() {
	const {data, error} = useSWR('/api/playlists/last10', fetcher)
	if (error) return <p>Error loading shows.</p>
	if (!data) return <p>Loading…</p>
	return (
		<ul className="divide-y divide-white/10">
			{data.shows.map((show) => {
				const start = new Date(show.starttime * 1000)
				const end = new Date((show.starttime + show.duration * 3600) * 1000)
				return (
					<li key={show.ID} className="py-2 text-sm md:text-base">
						<Link href={`/playlists/show/${show.ID}`}>
							<a className="text-sky-300 hover:underline">
								{show.title || show.othergenre} with {show.djname}
							</a>
						</Link>
						<div className="text-gray-400">
							{start.toLocaleString()} – {end.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
						</div>
					</li>
				)
			})}
		</ul>
	)
}

function DJs() {
	const {data, error} = useSWR('/api/playlists/djs', fetcher)
	if (error) return <p>Error loading DJs.</p>
	if (!data) return <p>Loading…</p>

	const grouped = useMemo(() => {
		const groups = {}
		for (const u of data.users) {
			const genre = u.defgenre || 'Undesignated'
			if (!groups[genre]) groups[genre] = []
			groups[genre].push(u)
		}
		return groups
	}, [data.users])

	return (
		<div className="grid gap-6 md:grid-cols-2">
			{Object.entries(grouped).map(([genre, list]) => (
				<div key={genre} className="rounded border border-white/10 bg-white/5 p-3">
					<h3 className="mb-2 font-semibold">{genre}</h3>
					<ul className="space-y-2">
						{list.map((dj) => (
							<li key={dj.ID}>
								<Link href={`/playlists/dj/${dj.ID}`}>
									<a className="text-sky-300 hover:underline">{dj.defdjname || dj.firstname}</a>
								</Link>
								{dj.deftitle ? <span className="ml-2 text-xs text-gray-400">[{dj.deftitle}]</span> : null}
							</li>
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

export default function PlaylistsPage() {
	return (
		<div className="mx-auto max-w-5xl px-4 py-10 text-white">
			<h1 className="kallisto mb-8 text-4xl">Playlists</h1>
			<Section title="Current Playlist">
				<CurrentPlaylist />
			</Section>
			<Section title="Shows from the last 10 days">
				<LastTen />
			</Section>
			<Section title="DJ List">
				<DJs />
			</Section>
		</div>
	)
}
