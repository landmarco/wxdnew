import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const AudioContext = createContext()

const STREAM_LOW = 'https://stream.wxdu.art/wxdu192.mp3'
const STREAM_HIGH = 'https://stream.wxdu.art/wxdu320.mp3'

export const AudioProvider = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false)
    const [isHighQuality, setIsHighQuality] = useState(false)
    // Two audio elements so we can buffer a new bitrate on the idle one and cut
    // over gaplessly. activeId marks which one is currently the live player.
    const audioARef = useRef(null)
    const audioBRef = useRef(null)
    const [activeId, setActiveId] = useState('a')

    // What the listener wants — so we only auto-reconnect when they meant to listen.
    const wantsToPlayRef = useRef(false)
    const reconnectTimer = useRef(null)
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

        // A live stream has no resumable position: on a genuine error, rejoin the
        // live edge by reloading the current source. Debounced so a downed server
        // isn't hammered. We deliberately ignore 'stalled'/'waiting', which fire
        // during normal buffering and would abort startup.
        const scheduleReconnect = () => {
            if (!wantsToPlayRef.current || reconnectTimer.current) return
            reconnectTimer.current = setTimeout(() => {
                reconnectTimer.current = null
                if (!wantsToPlayRef.current) return
                audio.src = currentSrcRef.current
                audio.load()
                audio.play().catch(() => {})
            }, 2000)
        }

        // Derive UI state from what the element is actually doing. 'play' fires
        // immediately on play(), keeping the button instant.
        const handlePlay = () => {
            clearReconnect()
            setIsPlaying(true)
        }
        const handlePause = () => setIsPlaying(false)

        audio.addEventListener('play', handlePlay)
        audio.addEventListener('pause', handlePause)
        audio.addEventListener('ended', handlePause)
        audio.addEventListener('error', scheduleReconnect)

        return () => {
            clearReconnect()
            audio.removeEventListener('play', handlePlay)
            audio.removeEventListener('pause', handlePause)
            audio.removeEventListener('ended', handlePause)
            audio.removeEventListener('error', scheduleReconnect)
        }
    }, [activeId])

    const togglePlayPause = () => {
        const audio = getActive()
        if (!audio) return

        if (isPlaying) {
            wantsToPlayRef.current = false
            audio.pause()
        } else {
            wantsToPlayRef.current = true
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
        <AudioContext.Provider value={{ isPlaying, togglePlayPause, isHighQuality, setHighQuality }}>
            <audio ref={audioARef} />
            <audio ref={audioBRef} />
            {children}
        </AudioContext.Provider>
    )
}

export const useAudio = () => useContext(AudioContext)
