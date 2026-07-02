import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const AudioContext = createContext()

const STREAM_LOW = 'https://stream.wxdu.art/wxdu192.mp3'
const STREAM_HIGH = 'https://stream.wxdu.art/wxdu320.mp3'

// How long a backgrounded, idle (not-playing) tab stays warm before we release
// the stream connection. Brief tab-flips — copying a link, glancing at another
// tab — stay well under this, so we don't churn the connection or dull the next
// play. A playing stream is never torn down (see the visibility effect).
const HIDDEN_UNLOAD_DELAY_MS = 138000 // 2m 18s

// Stream health watchdog. A live stream that loses its connection mid-play often
// fires neither 'error' nor 'pause' — the element just stops advancing currentTime
// while still reporting paused === false. So we poll for actual playback progress
// and, if none arrives for STALL_TIMEOUT_MS while the listener wants to play,
// treat the stream as dead and rejoin the live edge.
const WATCHDOG_INTERVAL_MS = 2000
const STALL_TIMEOUT_MS = 6000
const RECONNECT_DEBOUNCE_MS = 2000

// On resume after a pause, the browser has usually kept buffering the live
// broadcast, so we skip the playhead forward to the freshest buffered audio
// instead of replaying the stale paused moment — making a brief pause feel like
// the broadcast kept rolling, with no reconnect gap. We stop this far short of
// the buffer's leading edge so playback keeps a cushion and doesn't immediately
// stall, and only bother seeking when it'd recover more than MIN_CATCHUP_S.
const LIVE_EDGE_CUSHION_S = 1.5
const MIN_CATCHUP_S = 1

// If a resume can't catch the playhead to within this many seconds of live from
// the buffer alone — the browser's buffer cap was shorter than the pause, or the
// server dropped us as a slow client — we seamlessly rejoin the live edge in the
// background. We can't read the browser's buffer cap directly (no API exposes
// it), so we infer the shortfall as pause-duration minus how far the buffer
// actually let us skip forward.
const RESUME_REJOIN_THRESHOLD_S = 5

export const AudioProvider = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [isHighQuality, setIsHighQuality] = useState(false)
    // True when we want to be playing but no audio is actually flowing (a stalled
    // connection mid-stream) and we're trying to rejoin. Drives the UI's
    // "RECONNECTING" overlay.
    const [isStalled, setIsStalled] = useState(false)
    // True while the active element is buffering a fresh connection — the initial
    // page-load warm-up, or a re-warm after returning to the tab — and hasn't yet
    // reported it can play. Drives the header's "LICHENIZING" overlay. A mid-play
    // reconnect is a separate concern, surfaced by isStalled instead.
    const [isPreloading, setIsPreloading] = useState(false)
    // True while catching back up to live via a background crossover (see
    // crossoverToLive). Distinct from isStalled so the overlay can say "Rejoining"
    // for a deliberate catch-up vs "Reconnecting" for a dropped mid-play stream.
    const [isRejoining, setIsRejoining] = useState(false)
    // Two audio elements so we can buffer a new bitrate on the idle one and cut
    // over gaplessly. activeId marks which one is currently the live player.
    const audioARef = useRef(null)
    const audioBRef = useRef(null)
    const [activeId, setActiveId] = useState('a')

    // What the listener wants — so we only auto-reconnect when they meant to listen.
    const wantsToPlayRef = useRef(false)
    const reconnectTimer = useRef(null)
    // Counts down once a not-playing tab is backgrounded; on fire we release the
    // warm stream connection. Cleared the moment the tab is shown again.
    const hiddenTimer = useRef(null)
    // Wall-clock time of the last observed playback progress, for the watchdog.
    // 0 means "not progressing yet" (e.g. still buffering startup) — don't police.
    const lastProgressAtRef = useRef(0)
    // Last observed currentTime, used to confirm *genuine forward progress*. A
    // reconnect's load() resets currentTime, which must not be mistaken for the
    // audio actually resuming. -1 means "(re)loaded, awaiting a fresh baseline".
    const lastTimeRef = useRef(-1)
    // The URL the active element should be playing (follows quality changes).
    const currentSrcRef = useRef(STREAM_LOW)
    // Wall-clock time the listener last paused, so on resume we can tell how far
    // behind live we are and whether the buffer can catch us up on its own.
    const pausedAtRef = useRef(0)

    const getActive = () => (activeId === 'a' ? audioARef.current : audioBRef.current)
    const getInactive = () => (activeId === 'a' ? audioBRef.current : audioARef.current)

    // Make sure the active element starts out pointed at the low-quality stream.
    useEffect(() => {
        const active = activeId === 'a' ? audioARef.current : audioBRef.current
        if (active && !active.getAttribute('src')) {
            active.src = currentSrcRef.current
        }
    }, [activeId])

    // Track the cold warm-up so the header can show a "LICHENIZING" overlay while
    // the connection buffers, clearing it the moment the element can play. Only
    // the idle warm-up counts: a reconnect while the listener wants to play is
    // covered by the "Reconnecting" overlay (isStalled), so we skip those.
    useEffect(() => {
        const audio = activeId === 'a' ? audioARef.current : audioBRef.current
        if (!audio) return

        const startWarming = () => {
            if (!wantsToPlayRef.current) setIsPreloading(true)
        }
        const doneWarming = () => setIsPreloading(false)

        audio.addEventListener('loadstart', startWarming)
        audio.addEventListener('canplay', doneWarming)
        audio.addEventListener('playing', doneWarming)

        // Reconcile with the element's current state in case we attached after its
        // events fired: already buffered means ready; mid-load means still warming.
        if (audio.readyState >= 3 /* HAVE_FUTURE_DATA */) {
            setIsPreloading(false)
        } else if (audio.getAttribute('src') && !wantsToPlayRef.current) {
            setIsPreloading(true)
        }

        return () => {
            audio.removeEventListener('loadstart', startWarming)
            audio.removeEventListener('canplay', doneWarming)
            audio.removeEventListener('playing', doneWarming)
        }
    }, [activeId])

    // Listeners always follow the active element (re-attached when activeId flips).
    useEffect(() => {
        const audio = activeId === 'a' ? audioARef.current : audioBRef.current
        if (!audio) return

        const clearReconnect = () => {
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current)
                reconnectTimer.current = null
            }
        }

        // A live stream has no resumable position: to recover, rejoin the live
        // edge by reloading the current source. Debounced so a downed server (or
        // repeated watchdog checks) isn't hammered. Used for both hard errors and
        // silent stalls detected by the watchdog.
        const reconnect = () => {
            if (!wantsToPlayRef.current || reconnectTimer.current) return
            setIsStalled(true)
            reconnectTimer.current = setTimeout(() => {
                reconnectTimer.current = null
                if (!wantsToPlayRef.current) return
                audio.src = currentSrcRef.current
                audio.load()
                audio.play().catch(() => {})
                // Re-baseline currentTime (load() reset it) and restart the stall
                // clock so the watchdog retries this attempt if it produces no audio.
                lastTimeRef.current = -1
                lastProgressAtRef.current = Date.now()
            }, RECONNECT_DEBOUNCE_MS)
        }

        // Confirm *genuine forward progress* before declaring the stream healthy.
        // The load()-induced currentTime reset (and an optimistic 'playing') must
        // NOT clear the overlay — only currentTime actually advancing does, which
        // is when audio is truly flowing again.
        const markProgress = () => {
            if (audio.paused) return
            const t = audio.currentTime
            if (lastTimeRef.current < 0) {
                // First sample after a (re)load: set a baseline. Not yet proof of
                // progress, but we have data, so start the watchdog clock.
                lastTimeRef.current = t
                lastProgressAtRef.current = Date.now()
                return
            }
            if (t > lastTimeRef.current) {
                lastTimeRef.current = t
                lastProgressAtRef.current = Date.now()
                clearReconnect()
                setIsStalled(false)
            }
        }

        // Derive UI state from what the element is actually doing. 'play' fires
        // immediately on play(), keeping the button instant. 'playing'/'timeupdate'
        // mean audio is actually flowing.
        // Note: a reconnect's own load() can fire 'pause', so we don't clear the
        // stalled/overlay state here — only real progress or an explicit user
        // pause does. This keeps the overlay steady across reconnect attempts.
        const handlePlay = () => setIsPlaying(true)
        const handlePause = () => setIsPlaying(false)

        audio.addEventListener('play', handlePlay)
        audio.addEventListener('playing', markProgress)
        audio.addEventListener('timeupdate', markProgress)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handlePause)
        audio.addEventListener('error', reconnect)

        // Watchdog: if we want to play and the element isn't paused, but no
        // progress has arrived for STALL_TIMEOUT_MS, the stream has silently died
        // — rejoin. lastProgressAtRef === 0 means startup buffering, so we wait.
        const watchdog = setInterval(() => {
            if (!wantsToPlayRef.current || audio.paused) return
            if (lastProgressAtRef.current === 0) return
            if (Date.now() - lastProgressAtRef.current > STALL_TIMEOUT_MS) reconnect()
        }, WATCHDOG_INTERVAL_MS)

        return () => {
            clearReconnect()
            clearInterval(watchdog)
            audio.removeEventListener('play', handlePlay)
            audio.removeEventListener('playing', markProgress)
            audio.removeEventListener('timeupdate', markProgress)
            audio.removeEventListener('pause', handlePause)
            audio.removeEventListener('ended', handlePause)
            audio.removeEventListener('error', reconnect)
        }
    }, [activeId])

    // Release the warm stream connection while a tab is backgrounded and idle, so
    // we don't hold a listener slot on the server for someone who isn't (and may
    // never be) listening — then re-warm it when they return so the next play is
    // still instant. A playing stream is left completely untouched: it must stay
    // up as long as possible.
    useEffect(() => {
        // Active element, derived inline so this effect only depends on activeId.
        const activeEl = () => (activeId === 'a' ? audioARef.current : audioBRef.current)

        // Drop the buffer and close the connection (warm -> cold).
        const unloadIdle = () => {
            if (wantsToPlayRef.current) return
            const active = activeEl()
            if (!active || !active.getAttribute('src')) return
            active.pause()
            active.removeAttribute('src')
            active.load()
        }

        // Re-open the connection and re-buffer (cold -> warm), ready for an
        // instant play. togglePlayPause also restores src on demand, so a click
        // that beats this re-warm still works.
        const rewarm = () => {
            if (wantsToPlayRef.current) return
            const active = activeEl()
            if (!active || active.getAttribute('src')) return
            active.src = currentSrcRef.current
            active.load()
        }

        const handleVisibility = () => {
            if (document.hidden) {
                // Don't tear down a stream the listener wants playing.
                if (wantsToPlayRef.current) return
                if (hiddenTimer.current) clearTimeout(hiddenTimer.current)
                hiddenTimer.current = setTimeout(() => {
                    hiddenTimer.current = null
                    unloadIdle()
                }, HIDDEN_UNLOAD_DELAY_MS)
            } else {
                if (hiddenTimer.current) {
                    clearTimeout(hiddenTimer.current)
                    hiddenTimer.current = null
                }
                rewarm()
            }
        }

        document.addEventListener('visibilitychange', handleVisibility)
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility)
            if (hiddenTimer.current) {
                clearTimeout(hiddenTimer.current)
                hiddenTimer.current = null
            }
        }
    }, [activeId])

    // Rejoin the live edge WITHOUT a silence gap: keep playing whatever is still
    // buffered on the active element while we buffer a fresh live connection on
    // the idle one (muted, so the two never overlap), then cut over the instant
    // it's actually playing. Used when a resume can't catch up to live from the
    // buffer alone — a capped buffer, or the server having dropped us as a slow
    // client mid-pause. "Rejoining" shows for the whole crossover, since the
    // audio you're still hearing is the stale buffer until the cut.
    const crossoverToLive = () => {
        const next = getInactive()
        if (!next) return
        setIsRejoining(true)

        const cleanup = () => {
            next.removeEventListener('playing', onReady)
            next.removeEventListener('error', onError)
        }
        const onReady = () => {
            cleanup()
            const old = getActive()
            // Unmute the fresh stream and promote it to active; its listeners
            // re-attach via the activeId effect.
            next.muted = false
            setActiveId((id) => (id === 'a' ? 'b' : 'a'))
            setIsPlaying(true)
            setIsRejoining(false)
            lastTimeRef.current = -1
            lastProgressAtRef.current = Date.now()
            // Tear down the now-stale element so its connection closes promptly.
            old.pause()
            old.removeAttribute('src')
            old.load()
        }
        const onError = () => {
            cleanup()
            // Fresh connection failed — stay on the buffered audio and let the
            // watchdog reconnect in place if it ultimately runs dry.
            next.muted = false
            next.removeAttribute('src')
            next.load()
            setIsRejoining(false)
        }

        next.addEventListener('playing', onReady, { once: true })
        next.addEventListener('error', onError, { once: true })
        // Buffer the live stream silently so it never overlaps the stale audio;
        // we unmute it at the exact moment we cut over.
        next.muted = true
        next.src = currentSrcRef.current
        next.load()
        next.play().catch(() => {})
    }

    const togglePlayPause = () => {
        const audio = getActive()
        if (!audio) return

        const onPlayReject = () => {
            // play() can reject (e.g. browser autoplay policy). Keep state honest.
            wantsToPlayRef.current = false
            setIsPlaying(false)
        }

        if (isPlaying) {
            wantsToPlayRef.current = false
            pausedAtRef.current = Date.now()
            // Explicit user pause: drop the stalled/overlay state and reset the
            // watchdog clock so it doesn't police a deliberately-paused stream.
            setIsStalled(false)
            lastProgressAtRef.current = 0
            lastTimeRef.current = -1
            audio.pause()
        } else {
            wantsToPlayRef.current = true
            lastProgressAtRef.current = 0 // startup grace until 'playing' fires
            lastTimeRef.current = -1
            if (!audio.getAttribute('src')) {
                // Cold start: nothing buffered, just point at the stream and play.
                audio.src = currentSrcRef.current
                audio.play().catch(onPlayReject)
            } else {
                // Resuming a warm, paused stream: jump ahead to the live-most audio
                // the browser buffered while we were paused, rather than picking up
                // from the stale pause point. No reconnect, so no silence gap.
                const pausedForS = pausedAtRef.current ? (Date.now() - pausedAtRef.current) / 1000 : 0
                let caughtUpS = 0
                try {
                    const buf = audio.buffered
                    if (buf.length > 0) {
                        const liveEdge = buf.end(buf.length - 1) - LIVE_EDGE_CUSHION_S
                        const gap = liveEdge - audio.currentTime
                        if (gap > MIN_CATCHUP_S) {
                            audio.currentTime = liveEdge
                            caughtUpS = gap
                        }
                    }
                } catch {
                    // Some browsers refuse to seek a live stream — fall back to a
                    // plain resume rather than failing the play.
                }
                // Start the buffered audio immediately — no silence either way.
                audio.play().catch(onPlayReject)
                // If the buffer couldn't get us within threshold of live (its cap
                // was shorter than the pause, or the server dropped us as a slow
                // client), seamlessly rejoin live in the background while this
                // buffered audio keeps playing.
                if (pausedForS - caughtUpS > RESUME_REJOIN_THRESHOLD_S) {
                    crossoverToLive()
                }
            }
            // Consumed the pause timestamp — clear it so it can't bleed into a
            // later resume. (Set fresh on the next pause.)
            pausedAtRef.current = 0
        }
    }

    // Drop the buffered audio and reload the source to rejoin the live edge. A
    // plain HTTP stream has no live-edge seek: the browser just plays through an
    // ever-growing buffer, so latency only accumulates (see notes below). The one
    // way to catch back up to "now" is to tear down the connection and reconnect,
    // which is exactly what this does. No-op unless the listener is actually
    // playing — there's no live edge to chase while paused.
    const rejoinLive = () => {
        const audio = getActive()
        if (!audio || !wantsToPlayRef.current) return
        // Surface the "Reconnecting" overlay while the fresh connection buffers;
        // markProgress clears it once the new stream is actually flowing.
        setIsStalled(true)
        audio.src = currentSrcRef.current
        audio.load()
        audio.play().catch(() => {})
        // Re-baseline the watchdog so it judges this fresh attempt, not the old buffer.
        lastTimeRef.current = -1
        lastProgressAtRef.current = Date.now()
    }

    // Keep refs to the latest closures so the global key listener (bound once)
    // always calls current state, not a stale render's.
    const togglePlayPauseRef = useRef(togglePlayPause)
    togglePlayPauseRef.current = togglePlayPause
    const rejoinLiveRef = useRef(rejoinLive)
    rejoinLiveRef.current = rejoinLive

    // Global hotkeys: "k" toggles play/pause (like YouTube); "r" drops the buffer
    // and rejoins the live edge. Ignored while the user is typing in a field or
    // holding a modifier, so they never hijack text entry or browser shortcuts.
    useEffect(() => {
        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase()
            if (key !== 'k' && key !== 'r') return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const el = event.target
            const tag = el?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
            event.preventDefault()
            if (key === 'k') togglePlayPauseRef.current()
            else rejoinLiveRef.current()
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Switch the stream quality. Gapless when already playing: the new bitrate is
    // buffered on the idle element and we only cut over once it's truly playing.
    const setHighQuality = (toHigh) => {
        if (toHigh === isHighQuality) return

        const url = toHigh ? STREAM_HIGH : STREAM_LOW
        currentSrcRef.current = url
        setIsHighQuality(toHigh)

        const active = getActive()
        if (!active) return

        // Not playing: just arm the new source. Enabling HQ also starts playback
        // so the upgrade is audible immediately; reverting stays paused.
        if (!wantsToPlayRef.current) {
            active.src = url
            if (toHigh) {
                wantsToPlayRef.current = true
                active.load()
                active.play().catch(() => {
                    wantsToPlayRef.current = false
                    setIsPlaying(false)
                })
            }
            return
        }

        // Playing: crossover on the idle element.
        const next = getInactive()
        if (!next) return

        const cleanup = () => {
            next.removeEventListener('playing', onReady)
            next.removeEventListener('error', onError)
        }
        const onReady = () => {
            cleanup()
            const old = getActive()
            // Promote `next` to active; its listeners attach via the activeId effect.
            setActiveId((id) => (id === 'a' ? 'b' : 'a'))
            setIsPlaying(true)
            // Tear down the old element so its connection closes promptly.
            old.pause()
            old.removeAttribute('src')
            old.load()
        }
        const onError = () => {
            cleanup()
            // 320 failed to connect — stay on the current stream, undo the flag.
            next.removeAttribute('src')
            next.load()
            currentSrcRef.current = toHigh ? STREAM_LOW : STREAM_HIGH
            setIsHighQuality(!toHigh)
        }

        next.addEventListener('playing', onReady, { once: true })
        next.addEventListener('error', onError, { once: true })
        next.src = url
        next.load()
        next.play().catch(() => {})
    }

    return (
        <AudioContext.Provider value={{ isPlaying, isStalled, isRejoining, isPreloading, togglePlayPause, rejoinLive, isHighQuality, setHighQuality }}>
            {/* preload="auto" is explicit: keep the active element's stream warm so
                the first play is instant, rather than depending on the browser's
                default preload behavior (which varies). The idle element has no src
                until a quality crossover, so it stays cold. */}
            <audio ref={audioARef} preload="auto" />
            <audio ref={audioBRef} preload="auto" />
            {children}
        </AudioContext.Provider>
    )
}

export const useAudio = () => useContext(AudioContext)
