/*

Homepage "Shows we're stoked about" card — a compact companion to the Blog
Posts row that surfaces only today's and tomorrow's shows. Draws from the same
useShowEvents data as the full Upcoming Shows list.

The whole card is clickable and routes to the Upcoming Shows box on /explore.
Venue links stay live: they open the venue site and stopPropagation so a venue
click doesn't also trigger the card's navigation. (We use an onClick div rather
than wrapping the card in a <Link> so the inner venue <a>s aren't nested anchors.)

*/

import { useMemo } from "react"
import { useRouter } from "next/router"
import useShowEvents from "../../hooks/useShowEvents"
import { formatLocalDate, addDays } from "../../lib/schedule/showEvents"

const EXPLORE_SHOWS_HREF = "/explore#upcoming-shows"

export default function StokedShows() {
	const router = useRouter()
	const { calendar, loading, error } = useShowEvents(2)

	// map today's and tomorrow's ISO dates to friendly labels
	const labeledDays = useMemo(() => {
		const today = formatLocalDate(new Date())
		const tomorrow = addDays(today, 1)
		const labels = { [today]: "Today", [tomorrow]: "Tomorrow" }
		return calendar
			.filter((day) => labels[day.date] && Array.isArray(day.shows) && day.shows.length > 0)
			.map((day) => ({ ...day, label: labels[day.date] }))
	}, [calendar])

	const goToExplore = () => router.push(EXPLORE_SHOWS_HREF)

	const handleKeyDown = (e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault()
			goToExplore()
		}
	}

	return (
		<div
			role="link"
			tabIndex={0}
			onClick={goToExplore}
			onKeyDown={handleKeyDown}
			aria-label="Shows we're stoked about — see all upcoming shows"
			className="group flex h-full cursor-pointer flex-col rounded-lg border border-white bg-black/80 p-4 text-white transition hover:border-[#e0ff05] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e0ff05]"
		>
			<h2 className="kallisto mb-3 text-2xl leading-tight text-white group-hover:text-[#e0ff05]">
				Shows we&rsquo;re stoked about
			</h2>

			<div className="flex-1 text-sm tracking-[0.1em]">
				{loading && <div className="kallisto text-white">Loading shows...</div>}

				{!loading && error && <div className="kallisto text-red-300">Could not load shows.</div>}

				{!loading && !error && labeledDays.length === 0 && (
					<div className="kallisto text-neutral-300">No shows today or tomorrow.</div>
				)}

				{!loading &&
					!error &&
					labeledDays.map((day) => (
						<section key={day.date} className="border-b-4 border-white py-3 first:pt-0 last:border-b-0">
							<h3 className="font-bold mb-2 text-base text-[#e0ff05]">{day.label}</h3>
							<ul>
								{day.shows.map((show) => (
									<li key={`${day.date}-${show.eventId}`} className="border-b border-neutral-600 py-2 last:border-b-0">
										<div className="kallisto text-white">
											{show.venue.url ? (
												<a
													href={show.venue.url}
													target="_blank"
													rel="noopener noreferrer"
													onClick={(e) => e.stopPropagation()}
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

			<div className="mt-3 text-sm text-neutral-300 group-hover:text-white">All upcoming shows {">"}</div>
		</div>
	)
}
