/*

Polls the Express /api/twitch/status endpoint so the homepage knows whether
WXDU is currently livestreaming on Twitch (see components/homepage/
TwitchTakeover.js).

Deliberately a cheap JSON poll rather than the Twitch embed's own ONLINE event:
this way a visitor who arrives while the channel is dark — nearly all of them —
never loads Twitch's player at all. The embed only gets mounted once this says
we're live.

The server caches its Helix answer for ~60s, so polling faster than that would
just return the same bytes; we match the interval and skip polling entirely
while the tab is hidden, re-checking immediately when it comes back.

*/

import { useEffect, useState } from "react"
import { apiFetch } from "../lib/api"

const POLL_MS = 60 * 1000

export default function useTwitchStatus() {
	const [status, setStatus] = useState({ live: false })

	useEffect(() => {
		let cancelled = false
		let timer = null

		// Escape hatch for working on the widget when the channel isn't actually
		// live: load the homepage with ?twitch=preview. The embed will show
		// Twitch's own offline screen, but everything around it — layout, controls,
		// the audio hand-off — is the real thing. No polling in this mode.
		//
		// In development only, ?twitch=<channel> borrows somebody else's live
		// channel instead (e.g. ?twitch=rahresh), which is the only way to exercise
		// the parts that need real playing video: unmute, the radio-stream
		// hand-off, and the OFFLINE teardown.
		//
		// The arbitrary-channel form is dev-gated on purpose. It is read straight
		// off the query string, so shipping it would mean anyone could hand out
		// wxdu.org/?twitch=<anything> and have an arbitrary Twitch stream play
		// inside our chrome, under a LIVE badge. ?twitch=preview stays available
		// everywhere because it can only ever point at our own channel.
		const previewParam = new URLSearchParams(window.location.search).get("twitch")
		if (previewParam) {
			const isDev = process.env.NODE_ENV !== "production"
			// Twitch logins are [A-Za-z0-9_], max 25 — anything else isn't a channel.
			const borrowed =
				isDev && previewParam !== "preview" && /^\w{1,25}$/.test(previewParam)
					? previewParam
					: null
			if (borrowed || previewParam === "preview") {
				setStatus({
					live: true,
					channel: borrowed || "wxdu887",
					title: borrowed
						? `Preview: twitch.tv/${borrowed} (not WXDU)`
						: "Preview (not actually live)",
					startedAt: "preview",
				})
				return
			}
		}

		const check = async () => {
			try {
				const data = await apiFetch("/api/twitch/status")
				if (!cancelled) setStatus(data && typeof data === "object" ? data : { live: false })
			} catch {
				// Any failure (API down, network, CORS) means we simply don't show
				// the takeover. It's a bonus widget, not something worth surfacing
				// an error state for on the homepage.
				if (!cancelled) setStatus({ live: false })
			}
		}

		const schedule = () => {
			clearTimeout(timer)
			// A hidden tab isn't watching anything; stop polling until it's back.
			if (typeof document !== "undefined" && document.hidden) return
			timer = setTimeout(async () => {
				await check()
				schedule()
			}, POLL_MS)
		}

		const onVisibility = () => {
			if (document.hidden) {
				clearTimeout(timer)
			} else {
				// Back in view — get a current answer right away, then resume the
				// normal cadence, so a stream that started while the tab was in the
				// background shows up immediately.
				check()
				schedule()
			}
		}

		check()
		schedule()
		document.addEventListener("visibilitychange", onVisibility)

		return () => {
			cancelled = true
			clearTimeout(timer)
			document.removeEventListener("visibilitychange", onVisibility)
		}
	}, [])

	return status
}
