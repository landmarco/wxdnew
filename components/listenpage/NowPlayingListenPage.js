// Desktop-only "Now Playing" card for the listen page. Unlike NowPlayingHeader,
// this card's top/bottom are pinned to the same top:12.42%/height:75.34%
// offsets VinylPlayer uses for its own gray backdrop rectangle, so the two
// widgets' visible card edges line up when placed side by side in a
// items-stretch row.

import Link from "next/link";
import { useRouter } from "next/router";
import FitText from '../homepage/FitText';
import { useAudio } from '../AudioContext';

export default function NowPlayingCard({ currentPlaylist = {} }) {
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
    const title = show.title || "";
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
            className="hidden h-full w-full cursor-pointer select-none focus:outline-none focus-visible:outline-none lg:block"
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
            <div className="relative h-full">
              <div
                className="absolute left-0 flex w-full flex-col overflow-hidden rounded-[5px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                style={{ top: "12.42%", height: "75.34%" }}
              >
                <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/nowplaying/desktop-bg-gradient.png" />
                <div className="relative flex flex-1 flex-col px-3 pt-3 pb-3">
                    <h1 className="bitcount pl-5 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight text-white">Now Playing</h1>
                    <div
                        className="relative mt-2 flex flex-1 flex-col overflow-hidden rounded-[5px] bg-[#dad7d2]/40 bg-cover bg-top-left p-3 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                        style={{ backgroundImage: `url("/nowplaying/desktop-noise.png"), linear-gradient(90deg, rgba(218, 215, 210, 0.4) 0%, rgba(218, 215, 210, 0.4) 100%)`, containerType: "inline-size" }}
                    >
                        {/* CD in top-right corner. The clipping box itself spins (not the
                            oversized/offset image inside it), so it rotates around its own
                            visible center instead of wobbling; synced to VinylPlayer's isPlaying. */}
                        <div
                            className="animate-spin-vinyl absolute right-[4%] top-[4%] h-[18cqw] max-h-[130px] min-h-[48px] w-[18cqw] max-w-[130px] min-w-[48px] overflow-hidden rounded-full"
                            style={{ animationPlayState: isPlaying ? "running" : "paused" }}
                        >
                            <img alt="" className="absolute h-[278%] w-[177%] max-w-none" style={{ left: "-37.83%", top: "-121.06%" }} src="/nowplaying/cd.png" />
                        </div>

                        {/* Text spans nearly the full gray rectangle width (independent of the
                            explore button below it) so FitText has the most room to grow the
                            DJ/show text. The button keeps its own, narrower "long bar" width. */}
                        <div className="flex flex-1 flex-col justify-center gap-3">
                            <div className="w-[92%] h-[22cqw] max-h-[150px] min-h-[48px] min-w-0">
                                <FitText maxRatio={0.22} minRatio={0.05} deps={[djname, title]}>
                                    <p className="mb-0 font-courierprime leading-snug text-[#1e0d7a]">DJ: {djLink}</p>
                                    <p className="font-courierprime leading-snug text-[#1e0d7a]">Show: {showLink}</p>
                                </FitText>
                            </div>
                            <div className="w-[70%] bg-[#7d7575] px-3 py-2.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
                                <p className="font-courierprime text-lg text-[#fff7f7]">{exploreLink}</p>
                            </div>
                        </div>

                        {/* rat doodle: bottom-right corner, sized by cqw so it can never
                            overflow the card. Much bigger and pulled further up than
                            NowPlayingHeader's version so it reads clearly within this
                            shorter, height-matched card. */}
                        <div className="absolute right-[2%] bottom-[1%] h-[40cqw] max-h-[280px] w-[30cqw] max-w-[210px]">
                            <img alt="" className="pointer-events-none h-full w-full object-contain" src="/nowplaying/rat-doodle.png" />
                        </div>
                    </div>
                </div>
              </div>
            </div>
        </div>
    )
}
