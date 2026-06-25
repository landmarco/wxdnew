/*

fetch rows using apiFetch directly from the Express /api/events endpoint
  - request a 10-day window from current date

render day "sections", each listing shows with date, venue, description

skip days with no shows listed

*/

import { useEffect, useMemo, useState } from "react"
import { apiFetch } from "../../lib/api"

// formats local browser date into YYYY-MM-DD for the API query
function formatLocalDate(date) {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

// makes the date look nice and not numbery for display in div
function prettyDayLabel(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number)
	const date = new Date(year, month - 1, day)
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric"
	})
}

// normalizes API datetime values like 2026-06-12T04:00:00.000Z into YYYY-MM-DD
function formatEventDate(value) {
	if (typeof value === "string" && value.length >= 10) {
		return value.slice(0, 10)
	}
	return formatLocalDate(new Date(value))
}

function addDays(dateString, daysToAdd) {
	const [year, month, day] = dateString.split("-").map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	date.setUTCDate(date.getUTCDate() + daysToAdd)
	const y = date.getUTCFullYear()
	const m = String(date.getUTCMonth() + 1).padStart(2, "0")
	const d = String(date.getUTCDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

function enumerateDays(startDate, days) {
	const output = []
	for (let i = 0; i < days; i += 1) {
		output.push(addDays(startDate, i))
	}
	return output
}

// conservative hard-coded approach since there aren't that many venues
function fixMojibake(str) {
	if (!str) return ""
	return str
		.replace(/â€™/g, "'")
		.replace(/â€œ/g, "“")
		.replace(/â€/g, "”")
		.replace(/â€"/g, "—")
		.replace(/â€"/g, "–")
		.replace(/Â/g, "")
}

// transform raw /api/events rows into the calendar shape the component renders
function buildCalendar(rows, start, days) {
	const end = addDays(start, days - 1)
	const dayList = enumerateDays(start, days)

	const calendar = dayList.map((date) => ({ date, shows: [] }))
	const calendarByDate = new Map(calendar.map((entry) => [entry.date, entry]))

	rows.forEach((row) => {
		if (!row || !String(row.description || "").trim()) return

		const eventId = row.event_ID
		const showStart = formatEventDate(row.start_date)
		const showEnd = formatEventDate(row.end_date || row.start_date)

		if (!showStart || !showEnd || showStart > end || showEnd < start) return

		dayList.forEach((date) => {
			if (date >= showStart && date <= showEnd) {
				const dayEntry = calendarByDate.get(date)
				if (dayEntry) {
					const venueName = fixMojibake(row.location_name || "")
					const venueCity = fixMojibake(row.location_city || "")
					dayEntry.shows.push({
						eventId,
						startDate: showStart,
						endDate: showEnd,
						description: fixMojibake(String(row.description || "")),
						venue: {
							id: row.location_ID,
							name: venueName,
							city: venueCity,
							label: [venueName, venueCity].filter(Boolean).join(", "),
							url: row.location_url || ""
						}
					})
				}
			}
		})
	})

	calendar.forEach((entry) => {
		entry.shows.sort((a, b) => {
			const venueA = (a.venue.label || "").toLowerCase()
			const venueB = (b.venue.label || "").toLowerCase()
			if (venueA < venueB) return -1
			if (venueA > venueB) return 1
			return a.eventId - b.eventId
		})
	})

	return calendar
}

export default function ShowCalendar() {
	const [rows, setRows] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	useEffect(() => {
		let cancelled = false
		const start = formatLocalDate(new Date())

		async function fetchCalendar() {
			try {
				setLoading(true)
				setError(null)
				// call the Express API directly — Next.js API routes don't exist in the static export
				const events = await apiFetch("/api/events")
				const eventsArray = Array.isArray(events) ? events : []
				if (!cancelled) {
					setRows(buildCalendar(eventsArray, start, 10))
				}
			} catch (err) {
				if (!cancelled) {
					setError(err.message)
					setRows([])
				}
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}

		fetchCalendar()
		return () => {
			cancelled = true
		}
	}, [])

	const daysWithShows = useMemo(() => rows.filter((day) => Array.isArray(day.shows) && day.shows.length > 0), [rows])

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
		<div className="mx-auto w-[60vw] text-sm text-white tracking-[0.1em]">
			<h2 className="mb-3 text-lg text-white">Upcoming Shows</h2>
			<div className="max-h-[50vh] overflow-y-auto border border-white p-4">
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
