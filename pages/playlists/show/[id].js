import React from 'react'
import PlaylistTable from '../../../components/PlaylistTable'

export async function getServerSideProps({params, req}) {
	const base = process.env.NEXT_PUBLIC_SITE_URL || `http://${req.headers.host}`
	const res = await fetch(`${base}/api/playlists/show/${params.id}`)
	if (res.status === 404)
		return {
			notFound: true,
		}
	const data = await res.json()
	return {props: {data}}
}

export default function ShowPage({data}) {
	const {show, tracks, columns} = data
	return (
		<div className="mx-auto max-w-4xl px-4 py-10 text-white">
			<h1 className="kallisto mb-2 text-3xl">{show.title || show.othergenre}</h1>
			<p className="mb-4 text-sm text-gray-300">with {show.djname}</p>
			<PlaylistTable tracks={tracks} columns={columns.filter((c) => c !== 'showID' && c !== 'orderkey')} />
		</div>
	)
}

