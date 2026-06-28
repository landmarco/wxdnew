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

export const AudioProvider = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [isHighQuality, setIsHighQuality] = useState(false)
    // True when we want to be playing but no audio is actually flowing (a stalled
    // connection mid-stream) and we're trying to rejoin. Drives the UI's
    // "RECONNECTING" overlay.
    const [isStalled, setIsStalled] = useState(false)
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

    const getActive = () => (activeId === 'a' ? audioARef.current : audioBRef.current)
    const getInactive = () => (activeId === 'a' ? audioBRef.current : audioARef.current)

    // Make sure the active element starts out pointed at the low-quality stream.
    useEffect(() => {
        const active = activeId === 'a' ? audioARef.current : audioBRef.current
        if (active && !active.getAttribute('src')) {
            active.src = currentSrcRef.current
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

    const togglePlayPause = () => {
        const audio = getActive()
        if (!audio) return

        if (isPlaying) {
            wantsToPlayRef.current = false
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
            if (!audio.getAttribute('src')) audio.src = currentSrcRef.current
            audio.play().catch(() => {
                // play() can reject (e.g. browser autoplay policy). Keep state honest.
                wantsToPlayRef.current = false
                setIsPlaying(false)
            })
        }
    }

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
        <AudioContext.Provider value={{ isPlaying, isStalled, togglePlayPause, isHighQuality, setHighQuality }}>
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
