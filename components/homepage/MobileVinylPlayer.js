/* eslint-disable @next/next/no-img-element -- the turntable layers are absolutely
   positioned by percentage and images are unoptimized in next.config, so next/image
   would add complexity for no benefit. */
import { useRouter } from 'next/router'
import cardinalsFallback from '../../images/cardinals.jpg'
import { useNowPlaying } from '../../lib/useNowPlaying'
import { useAudio } from '../AudioContext'
import StreamButton from '../audioplayers/StreamButton'
import { Music } from 'pixelarticons/react/Music.js'
import { Mic } from 'pixelarticons/react/Mic.js'
import Disc from './DiscIcon'

// Mobile-only vinyl player: turntable stacked on top, text panel + button below,
// per the "Mobile Vinyl Player" Figma layout (node 8:2).
export default function MobileVinylPlayer() {
  const { song, loading } = useNowPlaying()
  const { isPlaying } = useAudio()
  const router = useRouter()
  const goToListen = () => router.push('/listen')

  return (
    <div
      className="relative mx-auto w-full max-w-[35rem] cursor-pointer select-none focus:outline-none focus-visible:outline-none"
      role="button"
      tabIndex={0}
      aria-label="Go to listen page"
      onClick={goToListen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goToListen()
        }
      }}
    >
      {/* Turntable block: fixed aspect ratio, same width as the panel below so both edges line up.
          Sized larger than before so the artwork reads bigger while still fitting fully inside
          this rectangle (the images are plain percentages of this box, so they can't overflow it). */}
      <div className="relative mx-auto w-[92%]" style={{ aspectRatio: '786 / 596' }}>
        {/* Light backdrop behind the turntable photo, flush with the block's edges so it lines up
            seamlessly with the gray frame below (same width, same color, no gap). */}
        <div className="absolute bg-[#d9d9d9]" style={{ left: '0%', top: '12.42%', right: '0%', bottom: '0%' }} />

        {/* Artwork group: each PNG is mostly transparent padding around a small opaque piece
            (measured from the actual files), so the drawn content only fills a small, off-center
            portion of this box by default. This transform re-scales the measured content bounding
            box and shifts it down so it sits just above the dark panel, instead of centered. */}
        <div className="absolute inset-0" style={{ transformOrigin: '0 0', transform: 'scale(1.15) translate(-11.71%, -0.55%)' }}>
          {/* Turntable photo layers (static) */}
          <img src="/vinyl-slider.png" alt="" className="pointer-events-none absolute" style={{ left: '0%', top: '0%', width: '100%', height: '100%' }} />
          <img src="/vinyl-notch.png" alt="" className="pointer-events-none absolute" style={{ left: '16.92%', top: '10.74%', width: '68.96%', height: '68.96%' }} />
          <img src="/vinyl-buttons.png" alt="" className="pointer-events-none absolute" style={{ left: '16.16%', top: '6.21%', width: '81.42%', height: '81.54%' }} />

          {/* Spinning record + album art label, always rotating */}
          <div
            className="animate-spin-vinyl pointer-events-none absolute"
            style={{ left: '7.00%', top: '10.23%', width: '88.80%', height: '77.52%', transformOrigin: '50% 50%', animationPlayState: isPlaying ? 'running' : 'paused' }}
          >
            <img src="/vinyl-cd.webp" alt="" className="absolute inset-0 h-full w-full" />
            <div className="absolute overflow-hidden rounded-full" style={{ left: '38.83%', top: '34.63%', width: '22.21%', height: '33.55%' }}>
              <img
                src={song?.albumArt || cardinalsFallback.src}
                alt={song ? `${song.album} cover` : ''}
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          {/* Tonearm sits on top, static */}
          <img src="/vinyl-stick.png" alt="" className="pointer-events-none absolute" style={{ left: '17.81%', top: '8.22%', width: '81.42%', height: '81.38%' }} />
        </div>
      </div>

      {/* Gray frame + dark text panel: normal document flow so it grows to fit any amount of
          content (long song/artist names wrapping, etc.) instead of a fixed percentage height. */}
      <div className="relative mx-auto w-[92%] bg-[#d9d9d9] p-[2%]">
        <div className="flex flex-col items-center justify-start gap-[5%] bg-[#2a1717] px-[5%] py-[4%] text-center">
          {loading ? (
            <span className="font-courierprime text-[3.5vw] text-zinc-400">loading...</span>
          ) : !song ? (
            <span className="font-courierprime text-[3.5vw] text-zinc-400">no playlist</span>
          ) : (
            <>
              <div lang="en" className="mt-[2vw] flex w-full min-w-0 flex-col gap-[1.5vw]">
                <div className="flex items-start gap-[2vw] text-left font-courierprime text-[5.5vw] leading-tight text-[#e0ff05]">
                  <span aria-hidden="true" className="w-[5.5vw] shrink-0 text-center"><Music width="1em" height="1em" style={{ imageRendering: 'pixelated' }} /></span>
                  <span className="min-w-0 font-bold hyphens-auto break-words">{song.song}</span>
                </div>
                {song.artist && (
                  <div className="flex items-start gap-[2vw] text-left font-courierprime text-[5.5vw] leading-tight text-white">
                    <span aria-hidden="true" className="w-[5.5vw] shrink-0 text-center"><Mic width="1em" height="1em" style={{ imageRendering: 'pixelated' }} /></span>
                    <span className="min-w-0 hyphens-auto break-words">{song.artist}</span>
                  </div>
                )}
                {song.album && (
                  <div className="flex items-start gap-[2vw] text-left font-courierprime text-[4vw] leading-tight text-[#e0ff05]">
                    <span aria-hidden="true" className="w-[4vw] shrink-0 text-center"><Disc width="1em" height="1em" style={{ imageRendering: 'pixelated' }} /></span>
                    <span className="min-w-0 italic hyphens-auto break-words">{song.album}</span>
                  </div>
                )}
                {/* Label hidden for now — felt too busy. Re-enable by uncommenting: */}
                {/* {song.label && <div className="hyphens-auto break-words font-courierprime text-[3.2vw] leading-tight text-white">🏷️ {song.label}</div>} */}
              </div>
              <StreamButton />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
