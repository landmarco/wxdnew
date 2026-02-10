import React from 'react'
import Link from 'next/link'

export async function getServerSideProps({params, req}) {
	const base = process.env.NEXT_PUBLIC_SITE_URL || `http://${req.headers.host}`
	const res = await fetch(`${base}/api/playlists/djs/${params.id}`)
	if (res.status === 404) return {notFound: true}
	const data = await res.json()
	return {props: {data}}
}

export default function DJPage({data}) {
	const {dj, playlists} = data
	return (
		<div className="mx-auto max-w-4xl px-4 py-10 text-white">
			<h1 className="kallisto mb-1 text-3xl">{dj.deftitle || dj.defdjname || dj.firstname}</h1>
			{dj.defsubtitle ? <p className="text-sm text-gray-300">{dj.defsubtitle}</p> : null}
			{dj.defothergenre ? <p className="text-sm text-gray-400">Genre: {dj.defothergenre}</p> : null}
			{dj.link ? (
				<p className="mt-2">
					<a className="text-sky-300 hover:underline" href={dj.link} target="_blank" rel="noreferrer">
						{dj.link}
					</a>
				</p>
			) : null}

			<h2 className="kallisto mt-6 mb-3 text-2xl">Playlists</h2>
			<ul className="divide-y divide-white/10">
				{playlists.map((show) => {
					const start = new Date(show.starttime * 1000)
					return (
						<li key={show.ID} className="py-2 text-sm md:text-base">
							<Link href={`/playlists/show/${show.ID}`}>
								<a className="text-sky-300 hover:underline">
									{start.toLocaleString()}
								</a>
							</Link>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

