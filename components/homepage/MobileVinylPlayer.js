import cardinalsFallback from '../../images/cardinals.jpg'
import { useNowPlaying } from '../../lib/useNowPlaying'
import { useAudio } from '../AudioContext'

// Mobile-only vinyl player: turntable stacked on top, text panel + button below,
// per the "Mobile Vinyl Player" Figma layout (node 8:2).
export default function MobileVinylPlayer() {
  const { song, dj, loading } = useNowPlaying()
  const { isPlaying, togglePlayPause } = useAudio()

  return (
    <div
      className="relative mx-auto w-full max-w-md cursor-pointer select-none focus:outline-none focus-visible:outline-none"
      role="button"
      tabIndex={0}
      aria-label={isPlaying ? 'Pause stream' : 'Play stream'}
      onClick={togglePlayPause}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          togglePlayPause()
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
              <div className="mt-[2vw] min-w-0">
                <div className="break-words font-courierprime text-[5.5vw] leading-tight text-[#e0ff05]">{song.song}</div>
                <div className="break-words font-courierprime text-[5.5vw] leading-tight text-white">{song.artist}</div>
              </div>

              <div className="break-words font-courierprime text-[3.8vw] text-[#e0ff05]">DJ: {dj || 'mystery dj'}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
