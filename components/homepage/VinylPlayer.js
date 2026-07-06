/* eslint-disable @next/next/no-img-element -- the turntable layers are absolutely
   positioned by percentage and images are unoptimized in next.config, so next/image
   would add complexity for no benefit. */
import { useRouter } from 'next/router'
import cardinalsFallback from '../../images/cardinals.jpg'
import { useNowPlaying } from '../../lib/useNowPlaying'
import { useAudio } from '../AudioContext'
import FitText from './FitText'
import StreamButton from '../audioplayers/StreamButton'

export default function VinylPlayer() {
  const { song, loading } = useNowPlaying()
  const { isPlaying } = useAudio()
  const router = useRouter()
  const goToListen = () => router.push('/listen')

  return (
    <div
      className="relative w-full cursor-pointer select-none focus:outline-none focus-visible:outline-none"
      style={{ aspectRatio: '1130 / 596', containerType: 'inline-size' }}
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
      {/* Light backdrop behind the turntable photo */}
      <div className="absolute bg-[#d9d9d9]" style={{ left: '0%', top: '12.42%', width: '97.08%', height: '75.34%' }} />

      {/* Dark text panel. Fixed box; FitText shrinks the text to fit so long
          track titles never spill out of it. */}
      <div
        className="absolute flex flex-col justify-center bg-[#2a1717] px-[3%] py-[3%]"
        style={{ left: '1.2%', top: '16.11%', width: '39.07%', height: '68.12%' }}
      >
        {loading ? (
          <span className="font-courierprime text-[3cqw] text-zinc-400">loading...</span>
        ) : !song ? (
          <span className="font-courierprime text-[3cqw] text-zinc-400">no playlist</span>
        ) : (
          <>
            {/* Two-column flow: an emoji gutter (w-[3.2cqw]) over the maroon, a gap,
                then the text. Plain flex (no negative margins / absolute) and no
                break-words/hyphens on the text, so FitText measures the real content
                width and sizes the font so whole words fit (no mid-word snapping). The
                StreamButton is indented by the full gutter (3.2 + 1 gap = pl-[4.2cqw])
                so the text lines up with it. */}
            <FitText deps={[song.song, song.artist, song.album, song.label]}>
              <div lang="en" className="flex items-baseline gap-[1cqw] text-left font-courierprime leading-tight text-[#e0ff05]">
                <span aria-hidden="true" className="w-[3.2cqw] shrink-0 text-center" style={{ fontSize: 'min(1em, 2.8cqw)' }}>🎵</span>
                <span className="min-w-0">{song.song}</span>
              </div>
              {song.artist && (
                <div lang="en" className="flex items-baseline gap-[1cqw] text-left font-courierprime leading-tight text-white">
                  <span aria-hidden="true" className="w-[3.2cqw] shrink-0 text-center" style={{ fontSize: 'min(1em, 2.8cqw)' }}>👩‍🎤</span>
                  <span className="min-w-0">{song.artist}</span>
                </div>
              )}
              {song.album && (
                <div lang="en" className="flex items-baseline gap-[1cqw] text-left font-courierprime leading-tight text-[#e0ff05]">
                  <span aria-hidden="true" className="w-[3.2cqw] shrink-0 text-center" style={{ fontSize: 'min(1em, 2.8cqw)' }}>💿</span>
                  <span className="min-w-0">{song.album}</span>
                </div>
              )}
              {/* Label hidden for now — felt too busy. Re-enable by uncommenting: */}
              {/* {song.label && <div lang="en" className="hyphens-auto break-words text-left font-courierprime leading-tight text-white" style={{ fontSize: '0.72em' }}>🏷️ {song.label}</div>} */}
            </FitText>
            <div className="pl-[4.2cqw]">
              <StreamButton />
            </div>
          </>
        )}
      </div>

      {/* Turntable photo layers (static) */}
      <img src="/vinyl-slider.png" alt="" className="pointer-events-none absolute" style={{ left: '30.44%', top: '0%', width: '69.56%', height: '100%' }} />
      <img src="/vinyl-notch.png" alt="" className="pointer-events-none absolute" style={{ left: '42.21%', top: '10.74%', width: '47.96%', height: '68.96%' }} />
      <img src="/vinyl-buttons.png" alt="" className="pointer-events-none absolute" style={{ left: '41.68%', top: '6.21%', width: '56.64%', height: '81.54%' }} />

      {/* Spinning record + album art label */}
      <div
        className="animate-spin-vinyl pointer-events-none absolute"
        style={{ left: '35.31%', top: '10.23%', width: '61.77%', height: '77.52%', transformOrigin: '50% 50%', animationPlayState: isPlaying ? 'running' : 'paused' }}
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
      <img src="/vinyl-stick.png" alt="" className="pointer-events-none absolute" style={{ left: '42.83%', top: '8.22%', width: '56.64%', height: '81.38%' }} />
    </div>
  )
}
