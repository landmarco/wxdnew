import { useState, useEffect } from 'react'
import Link from 'next/link'
import { IoPlaySkipForward } from 'react-icons/io5'
import cardinalsFallback from '../../images/cardinals.jpg'
import { useNowPlaying, formatClock, formatMMSS } from '../../lib/useNowPlaying'
import StreamButton from '../audioplayers/StreamButton'

export default function VinylPlayer() {
  const { song, loading, elapsedSec, remainingSec, progressPct } = useNowPlaying()

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: '1130 / 596' }}>
      {/* Light backdrop behind the turntable photo */}
      <div className="absolute bg-[#d9d9d9]" style={{ left: '0%', top: '12.42%', width: '97.08%', height: '75.34%' }} />

      {/* Dark text panel */}
      <div
        className="absolute flex flex-col items-center justify-center gap-[3%] bg-[#2a1717] px-[4%] py-[3%] lg:items-stretch"
        style={{ left: '1.86%', top: '16.11%', width: '38.41%', height: '68.12%' }}
      >
        {loading ? (
          <span className="font-courierprime text-[3.5vw] text-zinc-400 lg:text-[14px]">loading...</span>
        ) : !song ? (
          <span className="font-courierprime text-[3.5vw] text-zinc-400 lg:text-[14px]">no playlist</span>
        ) : (
          <>
            <div className="min-w-0">
              <div className="break-words text-left font-courierprime text-[5.5vw] leading-tight text-[#e0ff05] lg:text-[26px]">{song.song}</div>
              <div className="break-words text-left font-courierprime text-[5.5vw] leading-tight text-white lg:text-[26px]">{song.artist}</div>
            </div>
            <StreamButton />
          </>
        )}
      </div>

      {/* Turntable photo layers (static) */}
      <img src="/vinyl-slider.png" alt="" className="pointer-events-none absolute" style={{ left: '30.44%', top: '0%', width: '69.56%', height: '100%' }} />
      <img src="/vinyl-notch.png" alt="" className="pointer-events-none absolute" style={{ left: '42.21%', top: '10.74%', width: '47.96%', height: '68.96%' }} />
      <img src="/vinyl-buttons.png" alt="" className="pointer-events-none absolute" style={{ left: '41.68%', top: '6.21%', width: '56.64%', height: '81.54%' }} />

      {/* Spinning record + album art label, always rotating */}
      <div
        className="animate-spin-vinyl pointer-events-none absolute"
        style={{ left: '35.31%', top: '10.23%', width: '61.77%', height: '77.52%', transformOrigin: '50% 50%' }}
      >
        <img src="/vinyl-cd.png" alt="" className="absolute inset-0 h-full w-full" />
        <div className="absolute overflow-hidden rounded-full" style={{ left: '38.83%', top: '34.63%', width: '22.21%', height: '33.55%' }}>
          <img
            src={song?.albumArt || cardinalsFallback.src}
            alt={song ? `${song.album} cover` : ''}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Tonearm sits on top, static */}
      <img src="/vinyl-stick.png" alt="" className="pointer-events-none absolute" style={{ left: '42.83%', top: '8.22%', width: '56.64%', height: '81.38%' }} />
    </div>
  )
}
