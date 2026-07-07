// This component displays the current show and dj playing, plus a link to the
// previous-shows archive. 

import Link from "next/link";

export default function NowPlayingHeader({ currentPlaylist = {} }) {

    const show = currentPlaylist.show || {};
    const dj = currentPlaylist.dj || {};

    const djname = show.djname || dj.defdjname || "";
    const title = show.title || "";
    // user ID for the DJ's show-list page; present on the current-playlist payload
    const djId = dj.ID ?? show.userID;

    const djLink = djId && djname ? (
        <Link href={`/dj/?id=${djId}`} legacyBehavior={false} className="underline hover:no-underline">
            {djname}
        </Link>
    ) : djname;

    const showLink = title ? (
        <Link href="/current/" legacyBehavior={false} className="underline hover:no-underline">
            {title}
        </Link>
    ) : title;

    const exploreLink = (
        <Link href="/previous-shows/" legacyBehavior={false} className="underline hover:no-underline">
            explore any past show
        </Link>
    );

    return (
        <div>
            {/* Desktop */}
            <div className="relative hidden overflow-hidden rounded-[5px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] lg:block">
                <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/nowplaying/desktop-bg-gradient.png" />
                <div className="relative px-3 pt-3 pb-3">
                    <h1 className="bitcount pl-5 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-tight text-white">Now Playing</h1>
                    <div
                        className="relative mt-2 overflow-hidden rounded-[5px] bg-[#dad7d2]/40 bg-cover bg-top-left p-3 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                        style={{ backgroundImage: `url("/nowplaying/desktop-noise.png"), linear-gradient(90deg, rgba(218, 215, 210, 0.4) 0%, rgba(218, 215, 210, 0.4) 100%)` }}
                    >
                        {/* CD + text, sized to leave room on the right for the rat doodle */}
                        <div className="flex flex-col gap-2 pr-[26%]">
                            <div className="flex items-center gap-6">
                                <div className="relative h-[70px] w-[70px] shrink-0 overflow-hidden">
                                    <img alt="" className="absolute h-[278%] w-[177%] max-w-none" style={{ left: "-37.83%", top: "-121.06%" }} src="/nowplaying/cd.png" />
                                </div>
                                <div className="font-courierprime text-[24px] leading-snug text-[#1e0d7a]">
                                    <p className="mb-0">DJ: {djLink}</p>
                                    <p>Show: {showLink}</p>
                                </div>
                            </div>
                            <div className="inline-block bg-[#7d7575] px-3 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
                                <p className="font-courierprime text-base text-[#fff7f7]">{exploreLink}</p>
                            </div>
                        </div>

                        {/* rat doodle — bottom-right */}
                        <img
                            alt=""
                            className="pointer-events-none absolute object-contain"
                            style={{ left: "76.2%", top: "42.9%", width: "23.8%", height: "45.4%" }}
                            src="/nowplaying/rat-doodle.png"
                        />
                    </div>
                </div>
            </div>

            {/* Mobile */}
            <div className="relative overflow-hidden rounded-[5px] text-center shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] lg:hidden">
                <img alt="" className="absolute inset-0 h-full w-full object-cover" src="/nowplaying/mobile-bg-gradient.png" />
                <div className="relative px-1 pt-2 pb-2">
                    <h1 className="bitcount text-[clamp(1.35rem,6.5vw,2rem)] leading-tight text-white">Now Playing</h1>
                    <div
                        className="relative mt-0.5 overflow-hidden rounded-[5px] bg-[#dad7d2]/40 bg-cover bg-top-left p-2.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]"
                        style={{ backgroundImage: `url("/nowplaying/mobile-noise.png"), linear-gradient(90deg, rgba(218, 215, 210, 0.4) 0%, rgba(218, 215, 210, 0.4) 100%)` }}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <div className="relative h-[48px] w-[48px] shrink-0 overflow-hidden">
                                <img alt="" className="absolute h-[278%] w-[177%] max-w-none" style={{ left: "-37.83%", top: "-121.06%" }} src="/nowplaying/cd.png" />
                            </div>
                            <div className="font-courierprime text-base leading-snug text-[#2b10ba]">
                                <p className="mb-0">DJ: {djLink}</p>
                                <p>Show: {showLink}</p>
                            </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <div className="w-3/5 bg-[#7d7575] px-3 py-1.5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
                                <p className="font-courierprime text-xs text-[#fff7f7]">{exploreLink}</p>
                            </div>
                            <div className="flex w-2/5 justify-center">
                                <img alt="" className="pointer-events-none h-auto w-2/3 object-contain" src="/nowplaying/rat-doodle.png" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
