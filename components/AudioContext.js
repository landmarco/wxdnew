import React, { createContext, useContext, useEffect, useRef, useState } from 'react'

const AudioContext = createContext()

const STREAM_SRC = 'https://stream.wxdu.art/wxdu192.mp3'

export const AudioProvider = ({ children }) => {
    const [isPlaying, setIsPlaying] = useState(false)
    const audioRef = useRef(null)
    // What the listener wants — so we only auto-reconnect when they meant to listen.
    const wantsToPlayRef = useRef(false)
    const reconnectTimer = useRef(null)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const clearReconnect = () => {
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current)
                reconnectTimer.current = null
            }
        }

        // A live stream has no resumable position: on a genuine error, rejoin
        // the live edge by reloading the source. Debounced so a downed server
        // isn't hammered. We deliberately do NOT react to 'stalled'/'waiting',
        // which fire during normal buffering and would abort startup.
        const scheduleReconnect = () => {
            if (!wantsToPlayRef.current || reconnectTimer.current) return
            reconnectTimer.current = setTimeout(() => {
                reconnectTimer.current = null
                if (!wantsToPlayRef.current) return
                audio.src = STREAM_SRC
                audio.load()
                audio.play().catch(() => {})
            }, 2000)
        }

        // Derive the UI state from what the element is actually doing, rather
        // than guessing optimistically — so the button can't desync from reality.
        // 'play' fires immediately on play(), keeping the button instant.
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
    }, [])

    const togglePlayPause = () => {
        const audio = audioRef.current
        if (!audio) return

        if (isPlaying) {
            wantsToPlayRef.current = false
            audio.pause()
        } else {
            wantsToPlayRef.current = true
            // Just play — the element keeps the stream connected, so start/stop
            // is instant. The source is only reloaded on an actual error/stall
            // (see scheduleReconnect), not on every click.
            audio.play().catch(() => {
                // play() can reject (e.g. browser autoplay policy). Keep state honest.
                wantsToPlayRef.current = false
                setIsPlaying(false)
            })
        }
    }

    return (
        <AudioContext.Provider value={{ isPlaying, togglePlayPause }}>
            <audio ref={audioRef} src={STREAM_SRC} />
            {children}
        </AudioContext.Provider>
    )
}

export const useAudio = () => useContext(AudioContext)
