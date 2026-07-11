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
        </>
    )
}
