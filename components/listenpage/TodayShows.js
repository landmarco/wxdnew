// This components shows the shows that have happened today

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {getShowsInRange} from '@/lib/previousShows'
import {showDayKey, showTime} from '@/lib/showFormat'

const date = new Date();
const today = date.toLocaleDateString('en-CA');

export default function TodayShows() {
	const [shows, setShows] = useState([])
	const [loading, setLoading] = useState(true)

	// getting the shows
	useEffect(() => {
		let cancelled = false

		async function loadShows() {
			const rows = await getShowsInRange(today, today)
			const todayKey = showDayKey(Math.floor(Date.now() / 1000))
			const todaysShows = rows
				.filter((show) => showDayKey(show.starttime) === todayKey)
				.sort((a, b) => Number(b.starttime) - Number(a.starttime))

			if (!cancelled) {
				setShows(todaysShows)
				setLoading(false)
			}
		}

		loadShows()

		return () => {
			cancelled = true
		}
	}, [])

	if (loading) return <p>Loading shows...</p>
	if (shows.length === 0) return <p>No shows today.</p>

	return (
		<section className="w-full text-[#e0ff05]">
			<h2 className="bitcount sticky top-0 z-20 bg-black pb-6 text-4xl leading-none text-white sm:text-5xl md:text-6xl">
				Today&apos;s Shows
			</h2>
			<ul className="border-t border-zinc-300/80">
				{shows.map((show) => {
					const showTitle = show.title || 'Untitled show'
					const djName = show.defdjname || show.djname

					return (
						<li key={show.ID} className="border-b border-zinc-300/80">
							<Link href={`/show/?id=${show.ID}`}>
								<a className="group grid min-h-[110px] grid-cols-[154px_minmax(0,1fr)] px-2 py-5 transition-colors hover:bg-zinc-900 focus:bg-zinc-900 focus:outline-none">
									<span className="pr-5 text-right text-2xl leading-relaxed">
										{showTime(show.starttime)}
									</span>
									<span className="border-l border-zinc-300/90 py-1 pl-5 leading-snug">
										<span className="block text-2xl font-bold group-hover:underline">
											{showTitle}
										</span>
										{djName ? (
											<span className="mt-2 block text-base text-zinc-300">
												{djName}
											</span>
										) : null}
									</span>
								</a>
							</Link>
						</li>
					)
				})}
			</ul>
		</section>
	)
}
