/*

render day "sections", each listing shows with date, venue, description

skip days with no shows listed

Data (a 10-day window from the current date) comes from the shared
useShowEvents hook; day-building helpers live in lib/schedule/showEvents.

*/

import { useMemo } from "react"
import useShowEvents from "../../hooks/useShowEvents"
import { prettyDayLabel } from "../../lib/schedule/showEvents"

export default function ShowCalendar() {
	const { calendar, loading, error } = useShowEvents(10)

	const daysWithShows = useMemo(
		() => calendar.filter((day) => Array.isArray(day.shows) && day.shows.length > 0),
		[calendar]
	)

	if (loading) {
		return <div className="kallisto text-sm text-white">Loading shows...</div>
	}

	if (error) {
		return <div className="kallisto text-sm text-red-300">Could not load shows.</div>
	}

	if (daysWithShows.length === 0) {
		return <div className="kallisto text-sm text-white">No shows listed this week.</div>
	}

	return (
		<div id="upcoming-shows" className="mx-auto w-[60vw] scroll-mt-24 text-sm text-white tracking-[0.1em]">
			<h2 className="kallisto mb-6 text-4xl text-white lg:text-5xl">Upcoming Shows</h2>
			<div className="rounded-lg border border-white bg-black/80 p-4">
				{daysWithShows.map((day) => (
					<section key={day.date} className="border-b-4 border-white py-4 last:border-b-0">
						<h3 className="font-bold mb-3 text-base text-[#e0ff05]">{prettyDayLabel(day.date)}</h3>
						<ul>
							{day.shows.map((show) => (
								<li key={`${day.date}-${show.eventId}`} className="border-b border-neutral-600 py-2 last:border-b-0">
									<div className="kallisto text-white">
										{show.venue.url ? (
												<a
													href={show.venue.url}
													target="_blank"
													rel="noopener noreferrer"
													className="underline hover:no-underline"
													aria-label={`${show.venue.label} (opens in a new tab)`}
												>
												{show.venue.label || "Venue TBA"}
											</a>
										) : (
											<span>{show.venue.label || "Venue TBA"}</span>
										)}
									</div>
									<div className="text-neutral-300">{show.description}</div>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	)
}
