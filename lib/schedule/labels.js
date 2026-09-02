// Display labels for the schedule's header cells.
//
// The CSV stores hours as "<start>–<end>" with numeric 12-hour labels
// ("12 am–1 am", "11 am–12 pm"). On the site the two ambiguous ones are spelled
// out instead, the way they'd be read on air.
//
// Everything here is emitted lowercase, which suits both callers: the weekly
// grid uppercases its hour column in CSS (so "midnight" arrives as "MIDNIGHT"),
// while the homepage's Today list shows the label as-is.

// The CSV already writes the end of the last row as "midnight" rather than
// "12 am", so that spelling has to pass through untouched as well.
const SPELLED_OUT = {
	"12 am": "midnight",
	"12 pm": "noon",
}

// one end of a range: "12 am" -> "midnight", "12 pm" -> "noon", "1 pm" -> "1 pm"
export function formatHourLabel(label) {
	const s = String(label ?? "").trim()
	return SPELLED_OUT[s.toLowerCase()] ?? s
}

// a whole slot: "12 am–1 am" -> "midnight–1 am", "11 am–12 pm" -> "11 am–noon"
export function formatHourRange(range) {
	const s = String(range ?? "").trim()
	if (!s) return s
	// en dash, matching the separator the CSV is written with
	return s.split("–").map(formatHourLabel).join("–")
}

// The CSV's A1 corner cell tags the semester ("fall26"); the weekly grid shows
// it above the hour column. Expanding it here means the grid follows whatever
// schedule.csv was uploaded instead of needing a code change each semester.
// Anything that isn't a recognisable season tag passes through unchanged.
export function formatSeasonLabel(corner) {
	const s = String(corner ?? "").trim()
	const match = s.match(/^([a-z]+)\s*'?(\d{2}|\d{4})$/i)
	if (!match) return s

	const [, season, year] = match
	return `${season.toLowerCase()} ${year.length === 2 ? `20${year}` : year}`
}
