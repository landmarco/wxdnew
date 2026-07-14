/*

Fetches upcoming shows from the Express /api/events endpoint and returns them as
a day-by-day calendar. Shared by ShowCalendar (full Upcoming Shows list) and
StokedShows (homepage "Shows we're stoked about" card) so both draw from one
source of truth.

*/

import { useEffect, useState } from "react"
import { apiFetch } from "../lib/api"
import { fixEncodingDeep } from "../lib/fixEncoding"
import { buildCalendar, formatLocalDate } from "../lib/schedule/showEvents"

export default function useShowEvents(days = 10) {
	const [calendar, setCalendar] = useState([])
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
				const eventsArray = fixEncodingDeep(Array.isArray(events) ? events : [])
				if (!cancelled) {
					setCalendar(buildCalendar(eventsArray, start, days))
				}
			} catch (err) {
				if (!cancelled) {
					setError(err.message)
					setCalendar([])
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
	}, [days])

	return { calendar, loading, error }
}
