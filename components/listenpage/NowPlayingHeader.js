// This component displays the current show and dj playing, plus a link to the
// previous-shows archive.

import Link from "next/link";
import { useRouter } from "next/router";
import FitText from '../homepage/FitText';
import { useAudio } from '../AudioContext';

export default function NowPlayingHeader({ currentPlaylist = {}, forceMobile = false }) {
    const router = useRouter();
    const goToListen = () => router.push("/listen");
    // same play state VinylPlayer uses, so this CD spins/stops in lockstep with it
    const { isPlaying } = useAudio();

    // stops an inner link's click/keyboard activation from bubbling up to the
    // card wrapper, so DJ/Show/explore links route to their own pages instead
    // of also triggering the card's /listen redirect
    const stopCardNav = {
        onClick: (e) => e.stopPropagation(),
        onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        },
    };

    const show = currentPlaylist.show || {};
    const dj = currentPlaylist.dj || {};

    const djname = show.djname || dj.defdjname || "";
    // Fall back to "<DJ name>'s show" when the show has no title of its own, so
    // the label and its /current link stay present. Only truly empty when we
    // don't even know the DJ.
    const title = show.title || (djname ? `${djname}'s show` : "");
    // user ID for the DJ's show-list page; present on the current-playlist payload
    const djId = dj.ID ?? show.userID;

    const djLink = djId && djname ? (
        <Link href={`/dj/?id=${djId}`} legacyBehavior={false} className="underline hover:no-underline" {...stopCardNav}>
            {djname}
        </Link>
    ) : djname;

    const showLink = title ? (
        <Link href="/current/" legacyBehavior={false} className="underline hover:no-underline" {...stopCardNav}>
            {title}
        </Link>
    ) : title;

    const exploreLink = (
        <Link href="/previous-shows/" legacyBehavior={false} className="underline hover:no-underline" {...stopCardNav}>
            explore any past show
        </Link>
    );

    return (
        <div
            className="w-full cursor-pointer select-none focus:outline-none focus-visible:outline-none"
            role="button"
            tabIndex={0}
            aria-label="Go to listen page"
            onClick={goToListen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    goToListen();
                }
            }}
        >
            {/* Desktop. Capped at its design width (max-w-[36rem]) so it stops stretching
                on 2K/4K monitors and sits left-aligned in its half of the header, with empty
                space to the right. Without the cap the card keeps widening while its DJ/Show
                text box stays a fixed height, so FitText's min font size eventually can't fit
                two lines and the text clips. Only the card is capped — the vinyl player below
                (a separate sibling) still fills the full column width. */}
            <div className={`relative w-full max-w-[36rem] overflow-hidden rounded-[5px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] ${forceMobile ? "hidden" : "hidden lg:block"}`}>
                <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/nowplaying/desktop-bg-gradient.png" />
                <div className="relative px-3 pt-3 pb-3">
                    <h1 className="bitcount pl-5 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight text-white">Now Playing</h1>
                    <div
                        className="relative mt-2 overflow-hidden rounded-[5px] bg-[#dad7d2]/40 bg-cover bg-top-left p-3 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                        style={{ backgroundImage: `url("/nowplaying/desktop-noise.png"), linear-gradient(90deg, rgba(218, 215, 210, 0.4) 0%, rgba(218, 215, 210, 0.4) 100%)`, containerType: "inline-size" }}
                    >
                        {/* CD in top-right corner. The clipping box itself spins (not the
                            oversized/offset image inside it), so it rotates around its own
                            visible center instead of wobbling; synced to VinylPlayer's isPlaying. */}
                        <div
                            className="animate-spin-vinyl absolute right-[4%] top-[4%] h-[11cqw] max-h-[52px] min-h-[32px] w-[11cqw] max-w-[52px] min-w-[32px] overflow-hidden rounded-full"
                            style={{ animationPlayState: isPlaying ? "running" : "paused" }}
                        >
                            <img alt="" className="absolute h-[278%] w-[177%] max-w-none" style={{ left: "-37.83%", top: "-121.06%" }} src="/nowplaying/cd.png" />
                        </div>

                        {/* Text + button share an explicit width (not just content-driven) so the
                            button reads as a long bar and the text above it has real room to grow.
                            FitText measures that box to scale the DJ/show text to fill it exactly. */}
                        <div className="flex w-[80%] flex-col gap-2">
                            <div className="h-[15cqw] max-h-[64px] min-h-[40px] min-w-0">
                                <FitText maxRatio={0.16} minRatio={0.045} deps={[djname, title]}>
                                    <p className="mb-0 font-courierprime leading-snug text-[#1e0d7a]">DJ: {djLink}</p>
                                    <p className="font-courierprime leading-snug text-[#1e0d7a]">Show: {showLink}</p>
                                </FitText>
                            </div>
                            <div className="bg-[#7d7575] px-3 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
                                <p className="font-courierprime text-base text-[#fff7f7]">{exploreLink}</p>
                            </div>
                        </div>

                        {/* rat doodle: bottom-right corner, sized by cqw so it can never
                            overflow the card */}
                        <div className="absolute right-[2%] bottom-[-17%] h-[28cqw] max-h-[116px] w-[21cqw] max-w-[88px]">
                            <img alt="" className="pointer-events-none h-full w-full object-contain" src="/nowplaying/rat-doodle.png" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile: capped at the same max-w as MobileVinylPlayer (mx-auto w-full
                max-w-[35rem]) so the two widgets always line up edge-to-edge, regardless
                of how wide the parent container is on a given page. */}
            <div className={`relative mx-auto w-full max-w-[35rem] overflow-hidden rounded-[5px] text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] ${forceMobile ? "" : "lg:hidden"}`}>
                <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/nowplaying/mobile-bg-gradient.png" />
                <div className="relative px-1 pt-2 pb-2">
                    <h1 className="bitcount text-[clamp(1.35rem,6.5vw,2rem)] leading-tight text-white">Now Playing</h1>
                    <div
                        className="relative mt-0.5 overflow-hidden rounded-[5px] bg-[#dad7d2]/40 bg-cover bg-top-left p-2.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                        style={{ backgroundImage: `url("/nowplaying/mobile-noise.png"), linear-gradient(90deg, rgba(218, 215, 210, 0.4) 0%, rgba(218, 215, 210, 0.4) 100%)`, containerType: "inline-size" }}
                    >
                        {/* CD: top-right corner, spins in sync with VinylPlayer's isPlaying state */}
                        <div
                            className="animate-spin-vinyl absolute right-[3%] top-[3%] h-[13cqw] max-h-[44px] min-h-[28px] w-[13cqw] max-w-[44px] min-w-[28px] overflow-hidden rounded-full"
                            style={{ animationPlayState: isPlaying ? "running" : "paused" }}
                        >
                            <img alt="" className="absolute h-[278%] w-[177%] max-w-none" style={{ left: "-37.83%", top: "-121.06%" }} src="/nowplaying/cd.png" />
                        </div>

                        {/* Text + button share an explicit width (same rule as desktop) so the
                            button reads as a long bar. Left-aligned, overriding the card's
                            text-center. FitText scales the DJ/show text to fill that width. */}
                        <div className="flex w-[75%] flex-col gap-2 text-left">
                            <div className="h-[16cqw] max-h-[52px] min-h-[32px] min-w-0">
                                <FitText maxRatio={0.14} minRatio={0.045} deps={[djname, title]}>
                                    <p className="mb-0 font-courierprime leading-snug text-[#2b10ba]">DJ: {djLink}</p>
                                    <p className="font-courierprime leading-snug text-[#2b10ba]">Show: {showLink}</p>
                                </FitText>
                            </div>
                            <div className="bg-[#7d7575] px-3 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
                                <p className="font-courierprime text-xs text-[#fff7f7]">{exploreLink}</p>
                            </div>
                        </div>

                        {/* rat doodle: bottom-right corner, sized by cqw so it can never
                            overflow the card */}
                        <div className="absolute right-[1%] bottom-[-15%] h-[34cqw] max-h-[122px] w-[24cqw] max-w-[90px]">
                            <img alt="" className="pointer-events-none h-full w-full object-contain" src="/nowplaying/rat-doodle.png" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
