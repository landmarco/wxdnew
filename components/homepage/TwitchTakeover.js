/*

Homepage "takeover" — when WXDU is livestreaming on Twitch, the video takes the
top of the homepage, above the splash collage.

Live status comes from hooks/useTwitchStatus (a cached server check against the
Twitch API), NOT from the embed itself: that's what lets the homepage stay free
of Twitch code entirely on the ~99% of visits when the channel is dark. This
component renders nothing at all until it's told we're live.

Audio: the site already has its own 24/7 stream player, so the video always
starts MUTED and we render our own unmute control. The two are kept from
talking over each other in both directions — unmuting the video pauses the
radio stream, and starting the radio stream re-mutes the video. Those are
written as transition detectors (see the effects below) rather than plain state
sync, so they can't ping-pong.

*/

import { useEffect, useRef, useState } from "react"
import { IoVolumeHigh, IoVolumeMute, IoClose } from "react-icons/io5"
import { useAudio } from "../AudioContext"
import useTwitchStatus from "../../hooks/useTwitchStatus"

// Twitch's video-only player (no chat). Loaded on demand — never on a visit
// where the channel is offline.
const PLAYER_SCRIPT = "https://player.twitch.tv/js/embed/v1.js"
const PLAYER_ID = "twitch-takeover-player"

// Volume the video comes up at when someone hits unmute. Full blast from a
// muted start is startling, and Twitch remembers 0 as a volume, so we also use
// this to rescue a player whose stored volume is zero.
const UNMUTE_VOLUME = 0.8

// Twitch's player fires no event when its own built-in controls change the mute
// state, so we poll it. Only runs while the takeover is actually on screen.
const MUTE_POLL_MS = 500

let scriptPromise = null

// Load embed v1 once per page, reusing the same promise for any later mount
// (e.g. the stream drops and comes back while someone sits on the homepage).
function loadTwitchPlayer() {
	if (typeof window === "undefined") return Promise.reject(new Error("no window"))
	if (window.Twitch?.Player) return Promise.resolve(window.Twitch)
	if (scriptPromise) return scriptPromise

	scriptPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script")
		script.src = PLAYER_SCRIPT
		script.async = true
		script.onload = () => resolve(window.Twitch)
		script.onerror = () => {
			// Let a later mount retry rather than caching the failure forever.
			scriptPromise = null
			reject(new Error("Twitch embed failed to load"))
		}
		document.head.appendChild(script)
	})
	return scriptPromise
}

export default function TwitchTakeover() {
	const status = useTwitchStatus()
	const { isPlaying, togglePlayPause } = useAudio()

	// `endedLive` covers a stream that stops while someone is already on the page:
	// the embed tells us (OFFLINE) well before our 60s status poll would.
	const [endedLive, setEndedLive] = useState(false)
	const [dismissed, setDismissed] = useState(false)
	const [muted, setMuted] = useState(true)
	const [ready, setReady] = useState(false)
	const [failed, setFailed] = useState(false)

	const playerRef = useRef(null)
	// Previous values, so the audio-coordination effects below fire on the
	// TRANSITION into a state rather than on every render in it.
	const prevMutedRef = useRef(true)
	const prevPlayingRef = useRef(false)

	const live = !!status?.live && !endedLive
	const streamKey = status?.startedAt || ""
	const channel = status?.channel || "wxdu887"

	// A dismissal applies to THIS broadcast only (keyed by its start time) and
	// only to this tab's session — the next stream, or a fresh visit tomorrow,
	// gets to take over again. Read in an effect so the server-rendered markup
	// and the first client render agree.
	useEffect(() => {
		setEndedLive(false)
		if (!streamKey) {
			setDismissed(false)
			return
		}
		try {
			setDismissed(window.sessionStorage.getItem("wxdu-twitch-dismissed") === streamKey)
		} catch {
			// Private mode / storage disabled — just don't persist dismissals.
			setDismissed(false)
		}
	}, [streamKey])

	// Once the server agrees we're dark, clear the embed-driven flag so the next
	// broadcast starts from a clean slate no matter what the OFFLINE event did.
	useEffect(() => {
		if (!status?.live) setEndedLive(false)
	}, [status?.live])

	const dismiss = () => {
		setDismissed(true)
		try {
			if (streamKey) window.sessionStorage.setItem("wxdu-twitch-dismissed", streamKey)
		} catch {
			/* storage unavailable; dismissing for this render is enough */
		}
	}

	const shouldMount = live && !dismissed

	// Create the player when we go live, tear it down when we don't. Everything
	// Twitch-related — script, iframe, sockets — exists only inside this window.
	useEffect(() => {
		if (!shouldMount) return

		let cancelled = false
		setReady(false)
		setFailed(false)
		setMuted(true)
		prevMutedRef.current = true

		loadTwitchPlayer()
			.then((Twitch) => {
				if (cancelled || !document.getElementById(PLAYER_ID)) return

				const player = new Twitch.Player(PLAYER_ID, {
					channel,
					// Required when embedding off twitch.tv. Derived from the live
					// hostname so the same build works on wxdu.art, wxdu.org and
					// localhost without a rebuild (see lib/api.js for the same idea).
					parent: [window.location.hostname],
					width: "100%",
					height: "100%",
					// Muted autoplay is also the only autoplay browsers allow.
					muted: true,
					autoplay: true,
				})
				playerRef.current = player

				player.addEventListener(Twitch.Player.READY, () => {
					if (!cancelled) setReady(true)
				})
				// The broadcast ended under us — retire the widget instead of
				// leaving Twitch's offline screen sitting on the homepage.
				player.addEventListener(Twitch.Player.OFFLINE, () => {
					if (!cancelled) setEndedLive(true)
				})
			})
			.catch(() => {
				if (!cancelled) setFailed(true)
			})

		return () => {
			cancelled = true
			try {
				playerRef.current?.destroy()
			} catch {
				// destroy() throws if the iframe is already gone; nothing to clean.
			}
			playerRef.current = null
		}
	}, [shouldMount, channel])

	// Twitch's own controls can mute/unmute behind our back, and there's no event
	// for it, so mirror the player's real state into ours. Treating volume 0 as
	// muted keeps the button honest for someone who dragged the slider to zero.
	useEffect(() => {
		if (!ready) return
		const id = setInterval(() => {
			const player = playerRef.current
			if (!player) return
			try {
				setMuted(player.getMuted() || player.getVolume() === 0)
			} catch {
				/* player torn down mid-poll */
			}
		}, MUTE_POLL_MS)
		return () => clearInterval(id)
	}, [ready])

	// Video became audible → get the radio stream out of its way.
	useEffect(() => {
		const wasMuted = prevMutedRef.current
		prevMutedRef.current = muted
		if (wasMuted && !muted && isPlaying) togglePlayPause()
	}, [muted, isPlaying, togglePlayPause])

	// Radio stream started (header/footer/logo play button, or the "k" hotkey) →
	// mute the video so the listener hears one thing, not both.
	useEffect(() => {
		const wasPlaying = prevPlayingRef.current
		prevPlayingRef.current = isPlaying
		if (!wasPlaying && isPlaying && !muted) {
			try {
				playerRef.current?.setMuted(true)
			} catch {
				/* player gone */
			}
			setMuted(true)
		}
	}, [isPlaying, muted])

	const toggleMuted = () => {
		const player = playerRef.current
		if (!player) return
		const next = !muted
		try {
			player.setMuted(next)
			// Coming off mute with a stored volume of 0 would be silent — and would
			// immediately read back as muted again by the poll above.
			if (!next && player.getVolume() === 0) player.setVolume(UNMUTE_VOLUME)
		} catch {
			return
		}
		setMuted(next)
	}

	if (!shouldMount) return null

	return (
		/* Layout note — the margins here are load-bearing on desktop.
		   pages/index.js pulls its first child up by 80px (lg:-mt-20) to cancel
		   Header's mb-20 and sit flush under the nav tabs; the collage carries that
		   -mt-20 normally. When we render, WE are the first child, so we take the
		   -mt-20 instead — and then hand the collage its 80px back as bottom margin
		   so its own -mt-20 has something to cancel. 6.5rem = that 80px plus the
		   24px gap we actually want to see. The upshot is that index.js needs no
		   conditional: whether we render or not, the collage lands in the same
		   place. Keep the two in sync if Header's margin ever changes. */
		<div className="mx-auto mb-6 w-11/12 max-w-4xl pt-5 text-white md:w-5/6 lg:-mt-20 lg:mb-[6.5rem] lg:w-full lg:pt-0">
			<section
				aria-label="WXDU livestream"
				className="overflow-hidden rounded-lg border border-white bg-black/80 shadow-lg shadow-black/20 md:rounded-3xl"
			>
				{/* Title bar: what's happening, and the two controls that matter */}
				<div className="flex items-center gap-3 px-3 py-2 md:px-4 md:py-3">
					<span className="flex flex-none items-center gap-2 text-xs tracking-[0.15em] text-[#e0ff05] kallisto">
						<span className="inline-block h-2 w-2 flex-none animate-pulse rounded-full bg-red-500" />
						LIVE
					</span>

					<div className="min-w-0 flex-1">
						<div className="truncate text-sm md:text-base kallisto">
							{status?.title || "WXDU is streaming live"}
						</div>
						{status?.viewers > 0 && (
							<div className="text-xs text-neutral-400 courier-prime">
								{status.viewers} watching on{" "}
								<a
									href={`https://twitch.tv/${channel}`}
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:no-underline"
								>
									Twitch
								</a>
							</div>
						)}
					</div>

					<button
						type="button"
						onClick={toggleMuted}
						disabled={!ready}
						aria-label={muted ? "Unmute the livestream" : "Mute the livestream"}
						title={muted ? "Unmute (pauses the WXDU stream)" : "Mute"}
						className="flex flex-none items-center gap-2 rounded-full border border-white px-3 py-1 text-xs tracking-[0.1em] transition hover:border-[#e0ff05] hover:text-[#e0ff05] disabled:cursor-not-allowed disabled:opacity-40 kallisto"
					>
						{muted ? <IoVolumeMute size={16} /> : <IoVolumeHigh size={16} />}
						<span className="hidden sm:inline">{muted ? "UNMUTE" : "MUTE"}</span>
					</button>

					<button
						type="button"
						onClick={dismiss}
						aria-label="Hide the livestream"
						title="Hide the livestream"
						className="flex-none text-neutral-400 transition hover:text-[#e0ff05]"
					>
						<IoClose size={22} />
					</button>
				</div>

				{/* 16:9 stage. The player fills it absolutely so the box keeps its
				    shape while the iframe loads (no layout jump when it arrives). */}
				<div className="relative aspect-video w-full bg-black">
					<div id={PLAYER_ID} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />

					{!ready && (
						<div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm tracking-[0.15em] text-neutral-400 kallisto">
							{failed ? "COULDN'T LOAD THE STREAM" : "CONNECTING TO THE STREAM..."}
						</div>
					)}
				</div>
			</section>
		</div>
	)
}
