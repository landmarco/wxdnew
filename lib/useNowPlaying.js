import { useState, useEffect } from 'react'
import { getAlbumCover } from './recentlyPlayed'
import { reduceNowPlaying, subscribeCurrentPlaylist } from './nowPlaying'

// The playlist API only exposes a track's start time, not its length, so we
// assume a typical radio track length to estimate playback progress.
const ASSUMED_DURATION_SEC = 3 * 60 + 30

export function formatClock(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Shared playback state for the desktop and mobile vinyl player widgets.
export function useNowPlaying() {
  const [song, setSong] = useState(null)
  const [dj, setDj] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Read the current track straight off the shared live stream — the SAME
    // payload the header ticker uses — so the widget updates in lockstep with it.
    // (The old path re-fetched a separate "recently played" list and awaited
    // album art for up to 5 tracks before showing anything, which lagged behind
    // the header and could miss updates when those REST endpoints were cached.)
    // Album art isn't in the payload, so we resolve just the current track's art
    // asynchronously and patch it in once it arrives.
    let reqId = 0
    const unsubscribe = subscribeCurrentPlaylist((payload) => {
      const reduced = reduceNowPlaying(payload)
      setDj(reduced.dj)
      setLoading(false)

      const hasTrack = reduced.song || reduced.artist || reduced.album
      if (!hasTrack) {
        setSong(null)
        return
      }

      // Paint the track immediately. If it's the same track re-emitted (a
      // heartbeat, or a DJ-only change), keep the already-resolved album art
      // rather than clearing it and re-fetching — avoids a cover flicker.
      setSong((prev) => {
        const sameTrack =
          prev && prev.song === reduced.song && prev.artist === reduced.artist && prev.album === reduced.album
        if (sameTrack) return { ...prev, label: reduced.label, songstart: reduced.songstart }
        return {
          song: reduced.song,
          artist: reduced.artist,
          album: reduced.album,
          label: reduced.label,
          songstart: reduced.songstart,
          albumArt: null,
        }
      })

      // Resolve the current track's cover (cached across refreshes) and patch it
      // in, ignoring stale responses if the track has since changed.
      const myReq = ++reqId
      getAlbumCover(reduced.artist, reduced.album).then((art) => {
        if (myReq !== reqId) return
        setSong((prev) => {
          if (!prev || prev.artist !== reduced.artist || prev.album !== reduced.album || prev.albumArt === art) return prev
          return { ...prev, albumArt: art }
        })
      })
    })
    return unsubscribe
  }, [])

  // Ticks once a second so the progress bar/clock advance smoothly between playlist refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsedSec = song ? Math.min(Math.max((now - new Date(song.songstart).getTime()) / 1000, 0), ASSUMED_DURATION_SEC) : 0
  const remainingSec = ASSUMED_DURATION_SEC - elapsedSec
  const progressPct = (elapsedSec / ASSUMED_DURATION_SEC) * 100

  return { song, dj, loading, elapsedSec, remainingSec, progressPct }
}
