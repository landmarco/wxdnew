import { useAudio } from './AudioContext'
import { useBackground } from './BackgroundContext'
import AnimatedBackgroundShader from './AnimatedBackgroundShader'
import MobileAnimatedBackgroundShader from './MobileAnimatedBackgroundShader'

// The fixed, GPU-shader animated background that sits behind every page. Split out of
// _app so it can read the two contexts that gate it: the footer's on/off toggle
// (backgroundEnabled) and whether the stream is playing (isPlaying) — the graphic only
// drifts while the stream plays, holding on a static frame otherwise.
export default function SiteBackground() {
    const { backgroundEnabled } = useBackground()
    const { isPlaying } = useAudio()

    if (!backgroundEnabled) return null

    return (
        <>
            <div className="hidden lg:block">
                <AnimatedBackgroundShader size={17} animate={isPlaying} />
            </div>
            <div className="lg:hidden">
                <MobileAnimatedBackgroundShader animate={isPlaying} />
            </div>
            {/* Global legibility scrim: one semi-transparent black layer over the whole
                animated background so text is readable everywhere, instead of per-section
                boxes. Sits above the canvas (z-0) and below page content (z-10). Tune the
                /60 opacity to trade legibility against how vivid the background reads. */}
            <div className="pointer-events-none fixed inset-0 z-[1] bg-black/60" aria-hidden="true" />
        </>
    )
}
