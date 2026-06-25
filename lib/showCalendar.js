// Browser-side port of the old /api/show-calendar Next route, which doesn't
// exist in the static export. Fetches the station's public /api/events feed
// directly (api.wxdu.art / api.wxdu.org via the domain-aware apiFetch wrapper)
// and normalizes it into the day-grouped shape ShowCalendar renders:
//   [ { date: "YYYY-MM-DD", shows: [ { eventId, startDate, endDate,
//       description, venue: { id, name, city, label, url } } ] } ]

import { apiFetch } from "./api";

function formatLocalDate(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// normalizes API datetime values like 2026-06-12T04:00:00.000Z into YYYY-MM-DD
function formatEventDate(value) {
	if (typeof value === "string" && value.length >= 10) {
		return value.slice(0, 10);
	}
	return formatLocalDate(new Date(value));
}

function addDays(dateString, daysToAdd) {
	const [year, month, day] = dateString.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	date.setUTCDate(date.getUTCDate() + daysToAdd);
	const y = date.getUTCFullYear();
	const m = String(date.getUTCMonth() + 1).padStart(2, "0");
	const d = String(date.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function isValidISODate(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function enumerateDays(startDate, days) {
	const output = [];
	for (let i = 0; i < days; i += 1) {
		output.push(addDays(startDate, i));
	}
	return output;
}

// conservative hard-coded approach since there aren't that many venues
function fixMojibake(str) {
	if (!str) return "";
	return str
		.replace(/â€™/g, "’")
		.replace(/â€œ/g, "“")
		.replace(/â€/g, "”")
		.replace(/â€"/g, "—")
		.replace(/â€“/g, "–")
		.replace(/Â/g, "");
}

// Returns the normalized calendar array for a window of `days` starting at
// `start` (YYYY-MM-DD). Throws if the events feed can't be reached (apiFetch
// rejects on non-2xx) so the caller can show its error state.
export async function getShowCalendar(start, days = 10) {
	const today = formatLocalDate(new Date());
	const startDate = isValidISODate(start) ? start : today;

	// clamp the day window to keep payload and processing bounded
	const dayCount = Number.isFinite(days) ? Math.min(Math.max(days, 1), 14) : 10;

	const end = addDays(startDate, dayCount - 1);
	const dayList = enumerateDays(startDate, dayCount);

	// external API returns all future events
	const payload = await apiFetch("/api/events");
	const rows = Array.isArray(payload) ? payload : [];

	const calendar = dayList.map((date) => ({ date, shows: [] }));
	const calendarByDate = new Map(calendar.map((entry) => [entry.date, entry]));

	rows.forEach((row) => {
		// skip malformed rows and blank descriptions just in case
		if (!row || !String(row.description || "").trim()) {
			return;
		}

		// normalize incoming field names from /api/events
		const eventId = row.event_ID;
		const showStart = formatEventDate(row.start_date);
		const showEnd = formatEventDate(row.end_date || row.start_date);

		// skip anything that doesn't overlap the requested date window
		if (!showStart || !showEnd || showStart > end || showEnd < startDate) {
			return;
		}

		dayList.forEach((date) => {
			if (date >= showStart && date <= showEnd) {
				const dayEntry = calendarByDate.get(date);
				if (dayEntry) {
					const venueName = fixMojibake(row.location_name || "");
					const venueCity = fixMojibake(row.location_city || "");
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
					});
				}
			}
		});
	});

	calendar.forEach((entry) => {
		entry.shows.sort((a, b) => {
			const venueA = (a.venue.label || "").toLowerCase();
			const venueB = (b.venue.label || "").toLowerCase();
			if (venueA < venueB) return -1;
			if (venueA > venueB) return 1;
			return a.eventId - b.eventId;
		});
	});

	return calendar;
}
