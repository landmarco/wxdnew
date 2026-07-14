/*

Shared helpers for turning raw /api/events rows into the "upcoming shows"
calendar shape used by both the full Upcoming Shows list (ShowCalendar) and the
homepage "Shows we're stoked about" card (StokedShows).

*/

// formats a local browser date into YYYY-MM-DD
export function formatLocalDate(date) {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

// makes the date look nice and not numbery for display in div
export function prettyDayLabel(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number)
	const date = new Date(year, month - 1, day)
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric"
	})
}

// normalizes API datetime values like 2026-06-12T04:00:00.000Z into YYYY-MM-DD
export function formatEventDate(value) {
	if (typeof value === "string" && value.length >= 10) {
		return value.slice(0, 10)
	}
	return formatLocalDate(new Date(value))
}

export function addDays(dateString, daysToAdd) {
	const [year, month, day] = dateString.split("-").map(Number)
	const date = new Date(Date.UTC(year, month - 1, day))
	date.setUTCDate(date.getUTCDate() + daysToAdd)
	const y = date.getUTCFullYear()
	const m = String(date.getUTCMonth() + 1).padStart(2, "0")
	const d = String(date.getUTCDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

export function enumerateDays(startDate, days) {
	const output = []
	for (let i = 0; i < days; i += 1) {
		output.push(addDays(startDate, i))
	}
	return output
}

// conservative hard-coded approach since there aren't that many venues
export function fixMojibake(str) {
	if (!str) return ""
	return str
		.replace(/â€™/g, "'")
		.replace(/â€œ/g, "“")
		.replace(/â€/g, "”")
		.replace(/â€"/g, "—")
		.replace(/â€"/g, "–")
		.replace(/Â/g, "")
}

// transform raw /api/events rows into the calendar shape the components render
export function buildCalendar(rows, start, days) {
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
