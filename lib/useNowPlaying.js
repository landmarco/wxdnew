import { useState, useEffect } from 'react'
import { getRecentlyPlayed } from './recentlyPlayed'
import { getNowPlaying } from './nowPlaying'

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
    const fetchPlaylist = () => {
      getRecentlyPlayed()
        .then(data => { setSongs(data); setLoading(false) })
        .catch(() => setLoading(false))
      // The on-air DJ lives on the "current show" endpoint, not the recently
      // played tracks — fetch it alongside so the widget can show who's on.
      getNowPlaying()
        .then(data => setDj(data.dj))
        .catch(() => {})
    }
    fetchPlaylist()
    const id = setInterval(fetchPlaylist, 10000)
    return () => clearInterval(id)
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
