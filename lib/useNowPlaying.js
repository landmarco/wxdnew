import { useState, useEffect } from 'react'
import { getRecentlyPlayed } from './recentlyPlayed'
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
  const [songs, setSongs] = useState([])
  const [dj, setDj] = useState(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // The shared live stream tells us the instant the on-air show or track
    // changes. Use it as the trigger to refresh the album-art-enriched
    // "recently played" list, and read the current DJ straight off the streamed
    // payload (no separate now-playing fetch needed).
    let reqId = 0
    const unsubscribe = subscribeCurrentPlaylist((payload) => {
      setDj(reduceNowPlaying(payload).dj)
      // getRecentlyPlayed spans recent shows (so a just-started show still shows
      // the last track played); guard against out-of-order responses.
      const myReq = ++reqId
      getRecentlyPlayed()
        .then(data => { if (myReq === reqId) { setSongs(data); setLoading(false) } })
        .catch(() => { if (myReq === reqId) setLoading(false) })
    })
    return unsubscribe
  }, [])

  // Ticks once a second so the progress bar/clock advance smoothly between playlist refreshes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const song = songs[0]
  const elapsedSec = song ? Math.min(Math.max((now - new Date(song.songstart).getTime()) / 1000, 0), ASSUMED_DURATION_SEC) : 0
  const remainingSec = ASSUMED_DURATION_SEC - elapsedSec
  const progressPct = (elapsedSec / ASSUMED_DURATION_SEC) * 100

  return { song, dj, loading, elapsedSec, remainingSec, progressPct }
}
