import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { PRIMARY_HOST, FALLBACK_HOST, streamUrl, withHost, shouldFailover } from '@/lib/streamHosts'

const AudioContext = createContext()

// Stream hosts, URL building and the failover decision all live in
// lib/streamHosts.js, so the decision can be unit-tested away from the browser's
// timing (see the note there on why elapsed time, not attempt count, is the
// real trigger).

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

// How long a play attempt may produce no audio at all before we treat the start
// itself as failed and rejoin.
//
// STALL_TIMEOUT_MS can't cover this: it measures the gap since audio last
// flowed, and on a start that never delivers a byte there is no such moment to
// measure from. A connection that opens and then hangs fires no 'error' and no
// 'pause' — the element just sits at readyState 0 with play() pending — so
// without a deadline here nothing ever retries and the play button stays lit
// over silence.
//
// Measured healthy cold starts are ~3s to first audio on the 192 mount and ~5s
// on 320, over a good desktop connection. 15s leaves room for several times
// that on a weak phone signal before we give up on an attempt and start a
// fresh one, which is the cheaper mistake of the two.
//
// The crossovers (crossoverToLive, setHighQuality) bound their fresh connection
// with this same value, for the same reason and on the same evidence: it is the
// one question both are asking — how long may a new connection produce no audio
// before we call it failed — so it stays one number rather than two that drift.
const STARTUP_TIMEOUT_MS = 15000
const RECONNECT_DEBOUNCE_MS = 2000

// Ceiling for the retry backoff. A handoff that lands in a dead zone can leave
// us retrying for a while; without a cap we'd either hammer the server or, with
// a naive doubling, drift so far apart that recovery feels broken. 30s is short
// enough that a listener who walks back into coverage rejoins on their own.
const RECONNECT_MAX_DELAY_MS = 30000

// How long after a drop we'll still bring the stream back on our own.
//
// Recovery has to be time-boxed or it becomes a haunting. The only other things
// that end a session are an explicit pause and the OS pausing us (a route change
// — see handlePause); a network drop on its own never does, so without this
// window two things happen that nobody wants: audio starting by itself in a
// pocket twenty minutes later when coverage returns, and audio starting on
// unlock however long afterwards.
//
// A real wifi/cell handoff takes seconds, so 3 minutes recovers every genuine
// one silently — with room for a subway stop or an elevator — while still
// ruling out the ghosts. Past the window we stop trying and leave a normal
// paused player, which the lock-screen play button can restart (Media Session
// is wired up in NavPlayer).
//
// Measured against wall-clock at event time, never with a timer: a frozen page
// runs no timers, so a setTimeout giveup wouldn't fire during the freeze and
// would then go off late, at the worst possible moment.
const RECOVERY_WINDOW_MS = 180000 // 3 minutes

// A pause we didn't ask for is the OS stopping us, and we stop for good (see
// handlePause). Our own programmatic pause()/load() calls also fire 'pause',
// though, so anything within this long of one of ours is treated as ours. The
// element queues its 'pause' task rather than firing it inline, so this is a
// short wall-clock window rather than a flag flipped back on the next line.
const INTERNAL_PAUSE_WINDOW_MS = 1000

// How long handlePause waits before concluding a pause was the audio route
// disappearing. End-of-stream is the one other thing that pauses us unasked,
// and the spec fires its 'pause' *before* its 'ended' — two separate queued
// tasks — so the two are indistinguishable at the moment 'pause' arrives. This
// is just long enough for a following 'ended' to land and say "connection
// closed, not route lost", and short enough that a genuine route change still
// stops us promptly. Ending a session is the irreversible call here; spending
// 50ms to make it correctly is cheap.
const ROUTE_CHANGE_SETTLE_MS = 50

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
    // 'toHigh' while a 320 kbps upgrade is crossing over (header shows "MY
    // EMERALD!"), 'toLow' while reverting to 192 kbps ("RELINQUISHING"), null
    // otherwise. Set the instant a quality switch begins and cleared the moment
    // the target bitrate actually starts playing (or the switch fails).
    const [qualitySwitch, setQualitySwitch] = useState(null)
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
    // The URL the active element should be playing (follows quality changes and,
    // if the primary host stops answering, failover).
    const currentSrcRef = useRef(streamUrl(PRIMARY_HOST, false))
    // Which host we're currently pointed at. Sticky for the rest of the session
    // once we fail over — see the failover block in reconnect() for why.
    const activeHostRef = useRef(PRIMARY_HOST)
    // Wall-clock time the listener last paused, so on resume we can tell how far
    // behind live we are and whether the buffer can catch us up on its own.
    const pausedAtRef = useRef(0)
    // Consecutive failed reconnect attempts, for the retry backoff. Reset the
    // moment audio actually flows again (see markProgress).
    const reconnectAttemptsRef = useRef(0)
    // Wall-clock time the stream dropped, starting the RECOVERY_WINDOW_MS clock.
    // 0 means healthy (or deliberately stopped) — nothing to recover from.
    const droppedAtRef = useRef(0)
    // Deadline before which an incoming 'pause' event is one of ours. Set by
    // markInternalPause() ahead of every programmatic pause/load that can pause
    // the active element while the listener still wants to play.
    const internalPauseUntilRef = useRef(0)
    // Wall-clock time the listener's current play attempt began. Bounds the
    // startup grace period: lastProgressAtRef === 0 means "no audio has ever
    // flowed, don't police a stream that's still buffering", which is right
    // until it isn't — a connection that hangs without ever delivering a byte
    // sits in that state forever. This is what gives that state a deadline.
    // 0 means no attempt is outstanding.
    const playAttemptAtRef = useRef(0)

    const markInternalPause = () => {
        internalPauseUntilRef.current = Date.now() + INTERNAL_PAUSE_WINDOW_MS
    }

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

        // Pending "was that pause a route change?" decision (see handlePause).
        // Effect-local rather than a ref: it never outlives the listeners that
        // schedule it, and the cleanup below cancels it with them.
        let pendingStopTimer = null
        const clearPendingStop = () => {
            if (pendingStopTimer) {
                clearTimeout(pendingStopTimer)
                pendingStopTimer = null
            }
        }

        // A live stream has no resumable position: to recover, rejoin the live
        // edge by reloading the current source. Used for hard errors, silent
        // stalls caught by the watchdog, and the network-change signals below.
        //
        // `immediate` skips the debounce. Reserve it for events that already
        // prove the old connection is gone — 'online' after a network handoff,
        // or the listener returning to a stream that isn't running. Those are
        // the cases where every second of delay matters, because a backgrounded
        // page is racing the browser's freeze (see the network-change effect).
        // Everything else stays debounced so a downed server isn't hammered.
        //
        // Repeated failures back off exponentially. Without this, a handoff into
        // no coverage would retry every 2s until the battery noticed.
        // Start (or keep) the recovery clock. First detection wins, so the window
        // is measured from when the audio actually stopped, not from whichever
        // signal happened to reach us last.
        const noteDrop = () => {
            if (droppedAtRef.current === 0) droppedAtRef.current = Date.now()
        }

        // End the listening session: stop trying to recover and leave a clean
        // paused player rather than a stream that might erupt later. Called when
        // the recovery window lapses, and when the OS pauses us (see handlePause).
        //
        // Clearing wantsToPlay is what makes this stick: it's the gate on every
        // reconnect path, so once it's false nothing here can restart audio —
        // not a later 'online', not the listener unlocking their phone. Only a
        // deliberate play does, which is the whole point.
        //
        // The connection is released too, so we aren't holding a listener slot
        // for someone who stopped listening. The visibility effect re-warms it
        // when they come back to the tab, keeping the next tap instant.
        const stopPlayback = () => {
            clearReconnect()
            wantsToPlayRef.current = false
            droppedAtRef.current = 0
            reconnectAttemptsRef.current = 0
            // Back to the primary for the next fresh start: the fallback is a
            // way to survive an outage, not somewhere to leave people parked.
            if (activeHostRef.current !== PRIMARY_HOST) {
                activeHostRef.current = PRIMARY_HOST
                currentSrcRef.current = withHost(currentSrcRef.current, PRIMARY_HOST)
            }
            lastProgressAtRef.current = 0
            lastTimeRef.current = -1
            playAttemptAtRef.current = 0
            setIsStalled(false)
            setIsPlaying(false)
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
        }

        const recoveryExpired = () =>
            droppedAtRef.current > 0 && Date.now() - droppedAtRef.current > RECOVERY_WINDOW_MS

        const reconnect = ({immediate = false} = {}) => {
            if (!wantsToPlayRef.current) return
            noteDrop()
            // Checked here and again inside attempt(): a debounced attempt can
            // come due well after it was scheduled, and on a frozen page the gap
            // between the two is exactly where the window tends to lapse.
            if (recoveryExpired()) {
                stopPlayback()
                return
            }
            if (reconnectTimer.current) {
                if (!immediate) return
                // An immediate trigger outranks a debounce already in flight.
                clearTimeout(reconnectTimer.current)
                reconnectTimer.current = null
            }
            setIsStalled(true)

            const attempt = () => {
                reconnectTimer.current = null
                if (!wantsToPlayRef.current) return
                if (recoveryExpired()) {
                    stopPlayback()
                    return
                }
                // Pointless while the radio is off — 'online' will call us back.
                if (typeof navigator !== 'undefined' && navigator.onLine === false) return

                // The primary has been failing long enough to look like an
                // outage rather than a blip: move to the fallback host and give
                // it a clean backoff of its own. We do NOT move back mid-session
                // — flapping between two hosts sounds worse to a listener than
                // staying put, and stopPlayback() resets us for the next start.
                const outageMs = droppedAtRef.current > 0
                    ? Date.now() - droppedAtRef.current
                    : 0
                if (shouldFailover({
                    activeHost: activeHostRef.current,
                    attempts: reconnectAttemptsRef.current,
                    outageMs,
                })) {
                    activeHostRef.current = FALLBACK_HOST
                    currentSrcRef.current = withHost(currentSrcRef.current, FALLBACK_HOST)
                    reconnectAttemptsRef.current = 0
                }

                reconnectAttemptsRef.current += 1
                // load() below pauses the element and fires 'pause'; that one is ours.
                markInternalPause()
                audio.src = currentSrcRef.current
                audio.load()
                audio.play().catch(() => {})
                // Re-baseline currentTime (load() reset it) and restart the stall
                // clock so the watchdog retries this attempt if it produces no audio.
                lastTimeRef.current = -1
                lastProgressAtRef.current = Date.now()
            }

            if (immediate) {
                attempt()
                return
            }

            const delay = Math.min(
                RECONNECT_DEBOUNCE_MS * 2 ** reconnectAttemptsRef.current,
                RECONNECT_MAX_DELAY_MS
            )
            reconnectTimer.current = setTimeout(attempt, delay)
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
                reconnectAttemptsRef.current = 0
                droppedAtRef.current = 0
                setIsStalled(false)
            }
        }

        // Derive UI state from what the element is actually doing. 'play' fires
        // immediately on play(), keeping the button instant. 'playing'/'timeupdate'
        // mean audio is actually flowing.
        const handlePlay = () => setIsPlaying(true)

        // A 'pause' nobody asked for means something outside the page stopped the
        // audio — on a phone that is almost always the output route going away:
        // CarPlay unplugged, a Bluetooth speaker disconnecting, headphones pulled,
        // or another app taking over audio. Native players treat that as the end of
        // listening, and so do we.
        //
        // This is the difference between a route change and a network drop, and it
        // matters: a dead connection doesn't pause the element at all (it just
        // stops advancing currentTime, which is what the watchdog above is for), so
        // an actual 'pause' is a clean signal that the *device* stopped us, not the
        // network. Without this, the drop looks recoverable, wantsToPlay stays set,
        // and the next unlock hits handleReturn and starts audio in someone's
        // pocket — exactly what a pocket-safe player must never do.
        //
        // Restarting stays entirely in the listener's hands: the lock-screen and
        // steering-wheel play buttons route through togglePlayPause via Media
        // Session (wired in NavPlayer), same as tapping play on the page.
        //
        // Three pauses are NOT this: our own programmatic ones (markInternalPause
        // covers the window around each), the user's own pause, which clears
        // wantsToPlay before pausing and so falls out at the guard below, and
        // end-of-stream, which the deferred check below sorts out.
        const handlePause = () => {
            setIsPlaying(false)
            if (!wantsToPlayRef.current) return
            if (Date.now() < internalPauseUntilRef.current) return
            // Don't decide yet. A stream the server closed pauses us exactly like
            // a route change does, and only the 'ended' that follows tells them
            // apart — so settle it a beat later instead of here.
            clearPendingStop()
            pendingStopTimer = setTimeout(() => {
                pendingStopTimer = null
                if (!wantsToPlayRef.current) return
                // Audio is running again — a deliberate play, or a reconnect
                // attempt that beat us here. Nothing to stop.
                if (!audio.paused) return
                // The connection closed rather than the device taking our audio
                // away. Covers a browser that fires 'ended' before its 'pause';
                // handleEnded covers the spec order.
                if (audio.ended) {
                    reconnect()
                    return
                }
                stopPlayback()
            }, ROUTE_CHANGE_SETTLE_MS)
        }

        // A live stream has no natural end, so 'ended' means the server or the CDN
        // closed the connection — the same class of event as 'error', and squarely
        // inside what the recovery window exists to ride out. Treating it as a route
        // change (which is what routing it through handlePause used to do) ended the
        // session outright and left the listener staring at a dead play button.
        //
        // Debounced like handleDrop rather than immediate: an origin that closes
        // connections as fast as we open them is exactly the case the exponential
        // backoff protects, and hammering it would make a bad minute worse.
        const handleEnded = () => {
            setIsPlaying(false)
            if (!wantsToPlayRef.current) return
            clearPendingStop()
            reconnect()
        }

        // Wrapped so the DOM Event object is never passed through as options.
        const handleDrop = () => reconnect()

        // 'stalled'/'waiting' are ambiguous: they fire both when a live
        // connection dies and when one is merely slow to fill on a weak cell
        // signal. Treating the second case as a drop would tear down a startup
        // that was about to succeed and make bad connections strictly worse, so
        // only act once we've seen audio actually flow — the same "have we ever
        // progressed" guard the watchdog uses.
        const handleStall = () => {
            if (lastProgressAtRef.current === 0) return
            reconnect()
        }

        audio.addEventListener('play', handlePlay)
        audio.addEventListener('playing', markProgress)
        audio.addEventListener('timeupdate', markProgress)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handleEnded)
        audio.addEventListener('error', handleDrop)
        // A dropped connection often surfaces as 'stalled' or 'waiting' with no
        // 'error' at all — the element just quietly stops receiving data. Both
        // also fire during ordinary buffering, which is why they route through
        // the debounced path: if audio resumes on its own, markProgress cancels
        // the pending attempt before it runs.
        audio.addEventListener('stalled', handleStall)
        audio.addEventListener('waiting', handleStall)

        // Watchdog: if we want to play and the element isn't paused, but no
        // progress has arrived for STALL_TIMEOUT_MS, the stream has silently died
        // — rejoin. lastProgressAtRef === 0 means startup buffering, so we wait.
        const watchdog = setInterval(() => {
            if (!wantsToPlayRef.current || audio.paused) return
            if (lastProgressAtRef.current === 0) {
                // Still starting up: no audio has ever flowed, so there's no
                // progress gap to measure. Police the attempt itself instead —
                // a connection that hangs here reports nothing at all, and
                // without this the grace period never ends.
                if (
                    playAttemptAtRef.current > 0 &&
                    Date.now() - playAttemptAtRef.current > STARTUP_TIMEOUT_MS
                ) {
                    reconnect()
                }
                return
            }
            if (Date.now() - lastProgressAtRef.current > STALL_TIMEOUT_MS) reconnect()
        }, WATCHDOG_INTERVAL_MS)

        // --- Recovering across a network change --------------------------------
        //
        // The case this exists for: a phone on the lock screen moving between
        // wifi and cell service. The socket dies, and the element frequently
        // reports nothing at all — which would leave the watchdog above as the
        // only thing that notices. That doesn't hold up backgrounded, because
        // the watchdog is a setInterval, and browsers throttle timers hard (or
        // suspend them outright) once a page is hidden.
        //
        // Worse, the exemption that keeps a hidden page running at all is the
        // fact that it's playing audio. The instant the stream drops, that
        // exemption goes with it and the page becomes eligible to be frozen.
        // So recovery is racing the freeze, and a 2s debounce is most of the
        // budget. Events still get delivered where timers stop firing, which is
        // why the signals below are the ones doing the real work.
        //
        // 'online' fires on precisely the transition we care about, so it
        // reconnects immediately instead of paying the debounce.
        const handleOnline = () => reconnect({immediate: true})

        // Nothing can succeed while the radio is off: cancel any pending
        // attempt rather than burning it on a dead network, and let the
        // listener know we're on it. 'online' above restarts us.
        const handleOffline = () => {
            if (!wantsToPlayRef.current) return
            // Starts the recovery clock even though no media event may have
            // fired yet — losing the radio is itself the drop, and the window
            // should run from here rather than from whenever the element
            // eventually notices.
            noteDrop()
            clearReconnect()
            setIsStalled(true)
        }

        // If the page was frozen before any of that could run, this is the
        // catch-all for coming back: the listener unlocks the phone, and if
        // they still want audio and none is flowing, rejoin.
        //
        // Bounded by the same recovery window as everything else, and that is
        // deliberate. Unlocking seconds after a handoff picks the stream back
        // up, which is the point. Unlocking twenty minutes later does not
        // ambush anyone with audio — reconnect() sees the window has lapsed and
        // gives up instead, leaving a normal paused player.
        const handleReturn = () => {
            if (document.hidden || !wantsToPlayRef.current) return
            const flowing =
                !audio.paused &&
                lastProgressAtRef.current > 0 &&
                Date.now() - lastProgressAtRef.current < STALL_TIMEOUT_MS
            if (!flowing) reconnect({immediate: true})
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        document.addEventListener('visibilitychange', handleReturn)
        // A bfcache restore fires pageshow and no visibilitychange, so cover both.
        window.addEventListener('pageshow', handleReturn)

        return () => {
            clearReconnect()
            clearPendingStop()
            clearInterval(watchdog)
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            document.removeEventListener('visibilitychange', handleReturn)
            window.removeEventListener('pageshow', handleReturn)
            audio.removeEventListener('play', handlePlay)
            audio.removeEventListener('playing', markProgress)
            audio.removeEventListener('timeupdate', markProgress)
            audio.removeEventListener('pause', handlePause)
            audio.removeEventListener('ended', handleEnded)
            audio.removeEventListener('error', handleDrop)
            audio.removeEventListener('stalled', handleStall)
            audio.removeEventListener('waiting', handleStall)
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

        // A connection that hangs fires neither 'playing' nor 'error' — it just
        // never reports anything (the same failure STARTUP_TIMEOUT_MS exists for).
        // Without a deadline the crossover never settles: "REJOINING" stays on
        // screen for good, and the idle element holds a dead connection open.
        // Time it out into onError, which is already the "fresh connection
        // failed" path — it releases the connection and leaves the listener on
        // the buffered audio.
        let settleTimer = null
        const cleanup = () => {
            if (settleTimer) {
                clearTimeout(settleTimer)
                settleTimer = null
            }
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
            // Its listeners may not have detached yet, so claim the 'pause'.
            markInternalPause()
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
        settleTimer = setTimeout(onError, STARTUP_TIMEOUT_MS)
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
            reconnectAttemptsRef.current = 0
            droppedAtRef.current = 0
            playAttemptAtRef.current = 0
            audio.pause()
        } else {
            wantsToPlayRef.current = true
            lastProgressAtRef.current = 0 // startup grace until 'playing' fires
            // ...but a bounded one: this is the deadline the watchdog measures
            // the startup against, covering both a cold start and a warm resume
            // whose connection died while we were paused.
            playAttemptAtRef.current = Date.now()
            lastTimeRef.current = -1
            // A deliberate play starts a fresh session: clear both the backoff
            // and the recovery clock, so this attempt isn't judged by how long
            // an earlier drop has been sitting there.
            reconnectAttemptsRef.current = 0
            droppedAtRef.current = 0
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
        // load() pauses the element and fires 'pause'; that one is ours.
        markInternalPause()
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
    // Assigned after setHighQuality is defined below (it's declared later in this
    // component, so we can't reference it up here without a temporal-dead-zone error).
    const setHighQualityRef = useRef(null)
    const isHighQualityRef = useRef(isHighQuality)
    isHighQualityRef.current = isHighQuality

    // Global hotkeys: "k" toggles play/pause (like YouTube); "r" drops the buffer
    // and rejoins the live edge; "e" toggles the 320 kbps stream (like clicking the
    // footer emerald). Ignored while the user is typing in a field or holding a
    // modifier, so they never hijack text entry or browser shortcuts.
    useEffect(() => {
        const handleKeyDown = (event) => {
            const key = event.key.toLowerCase()
            if (key !== 'k' && key !== 'r' && key !== 'e') return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            const el = event.target
            const tag = el?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
            event.preventDefault()
            if (key === 'k') togglePlayPauseRef.current()
            else if (key === 'r') rejoinLiveRef.current()
            else setHighQualityRef.current?.(!isHighQualityRef.current)
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [])

    // Switch the stream quality. Gapless when there's audio to keep: the target
    // bitrate is buffered (muted) on the idle element and we only cut over once
    // it's truly playing, so the two bitrates never overlap audibly.
    //
    // While playing, the listener keeps hearing the CURRENT bitrate until the cut,
    // and the switch surfaces an overlay — "MY EMERALD!" upgrading to 320,
    // "RELINQUISHING" reverting to 192 (see qualitySwitch), cleared when the target
    // starts playing.
    //
    // While PAUSED, behavior depends on `startIfStopped`:
    //  - false (footer emerald, "e" hotkey): silently re-arm the target bitrate
    //    for the next play and stay paused — no audio, no overlay.
    //  - true (the /listen buttons, homepage logo): start the current bitrate
    //    immediately so there's audio during the switchover, then crossover to the
    //    target (with the overlay), matching the "start it if stopped" behavior the
    //    quality buttons call for.
    const setHighQuality = (toHigh, { startIfStopped = false } = {}) => {
        if (toHigh === isHighQuality) return

        // Built from the host we're actually on, so switching bitrate while
        // failed over doesn't quietly send us back to a host that isn't answering.
        const targetUrl = streamUrl(activeHostRef.current, toHigh)
        // The bitrate currently playing/armed, which keeps sounding until the cut.
        const sourceUrl = streamUrl(activeHostRef.current, !toHigh)
        currentSrcRef.current = targetUrl
        setIsHighQuality(toHigh)

        const active = getActive()
        if (!active) return

        // Paused + no forced start: just arm the target for the next play, stay
        // silent, and don't run a crossover or show an overlay.
        if (!wantsToPlayRef.current && !startIfStopped) {
            if (active.getAttribute('src') !== targetUrl) active.src = targetUrl
            return
        }

        setQualitySwitch(toHigh ? 'toHigh' : 'toLow')

        const next = getInactive()
        if (!next) {
            setQualitySwitch(null)
            return
        }

        // Same deadline as the crossover above, and for the same reason: a hung
        // connection reports nothing, so without it the switch never settles —
        // the overlay ("MY EMERALD!" / "RELINQUISHING") sticks forever while
        // isHighQuality claims a bitrate that never actually started. onError
        // releases the connection and reverts the flag.
        let settleTimer = null
        const cleanup = () => {
            if (settleTimer) {
                clearTimeout(settleTimer)
                settleTimer = null
            }
            next.removeEventListener('playing', onReady)
            next.removeEventListener('error', onError)
        }
        const onReady = () => {
            cleanup()
            const old = getActive()
            // Unmute the freshly-buffered target and promote it to active; its
            // listeners re-attach via the activeId effect.
            next.muted = false
            setActiveId((id) => (id === 'a' ? 'b' : 'a'))
            setIsPlaying(true)
            setQualitySwitch(null)
            lastTimeRef.current = -1
            lastProgressAtRef.current = Date.now()
            // Tear down the old element so its connection closes promptly.
            // Its listeners may not have detached yet, so claim the 'pause'.
            markInternalPause()
            old.pause()
            old.removeAttribute('src')
            old.load()
        }
        const onError = () => {
            cleanup()
            next.muted = false
            next.removeAttribute('src')
            next.load()
            // Target bitrate failed to connect — stay on the source, undo the flag.
            currentSrcRef.current = sourceUrl
            setIsHighQuality(!toHigh)
            setQualitySwitch(null)
        }

        // Buffer the target bitrate silently on the idle element; unmuted at the
        // exact moment we cut over so it never overlaps the source audio.
        next.addEventListener('playing', onReady, { once: true })
        next.addEventListener('error', onError, { once: true })
        next.muted = true
        next.src = targetUrl
        next.load()
        next.play().catch(() => {})
        settleTimer = setTimeout(onError, STARTUP_TIMEOUT_MS)

        // Stopped: start the current bitrate on the active element right away so
        // audio is flowing during the switchover. (Already playing: leave the
        // active element alone — it keeps playing the current bitrate until the
        // cut.)
        if (!wantsToPlayRef.current) {
            wantsToPlayRef.current = true
            lastProgressAtRef.current = 0
            lastTimeRef.current = -1
            // If the element is already warm on the source bitrate, resume its
            // buffer instantly rather than reloading it.
            if (active.getAttribute('src') !== sourceUrl) active.src = sourceUrl
            active.play().catch(() => {
                // Autoplay refused: abort the switch and stay stopped on source.
                cleanup()
                next.muted = false
                next.removeAttribute('src')
                next.load()
                wantsToPlayRef.current = false
                setIsPlaying(false)
                currentSrcRef.current = sourceUrl
                setIsHighQuality(!toHigh)
                setQualitySwitch(null)
            })
        }
    }
    // Keep the "e" hotkey pointed at the latest setHighQuality closure.
    setHighQualityRef.current = setHighQuality

    return (
        <AudioContext.Provider value={{ isPlaying, isStalled, isRejoining, isPreloading, qualitySwitch, togglePlayPause, rejoinLive, isHighQuality, setHighQuality }}>
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
