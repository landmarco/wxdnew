import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FaPause, FaPlay } from "react-icons/fa";
import { useAudio } from "../AudioContext";
import { getNowPlaying } from "../../lib/nowPlaying";
import Emerald from "../Emerald";

const NavPlayer = () => {
    const { isPlaying, togglePlayPause, isHighQuality } = useAudio();

    // refs for measuring available ticker width vs text width
    const tickerContainerRef = useRef(null);
    const tickerTextRef = useRef(null);

    // computed scroll distance for ping-pong ticker animation
    const [tickerDistance, setTickerDistance] = useState(0);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    const [nowPlaying, setNowPlaying] = useState({
        artist: null,
        song: null,
        album: null,
        dj: "mystery dj"
    });

    // fetches directly from the external WXDU API (api.wxdu.art / api.wxdu.org).
    // the old /api/now-playing Next route doesn't exist in the static export,
    // so we call the API straight through the domain-aware apiFetch wrapper.
    async function fetchNowPlaying() {
        try {
            const data = await getNowPlaying();

            setNowPlaying({
                artist: data.artist,
                song: data.song,
                album: data.album,
                dj: data.dj
            });
        } catch (error) {
            console.error("Failed to fetch now-playing data:", error);
        }
    }

    // do an immediate fetch and then refresh every 10 seconds
    useEffect(() => {
        fetchNowPlaying();

        const interval = setInterval(fetchNowPlaying, 10000);
        return () => clearInterval(interval);
    }, []);

    // only show track info when artist/song/album are all present
    const currentTrack =
        nowPlaying.artist && nowPlaying.song
            ? `${nowPlaying.artist} — ${nowPlaying.song}`
            : "it's a secret... tune in to find out";

    // measure text and container widths so animation distance is exact
    useEffect(() => {
        function measureTicker() {
            const containerWidth = tickerContainerRef.current?.getBoundingClientRect().width || 0;
            const textWidth = tickerTextRef.current?.getBoundingClientRect().width || 0;
            setTickerDistance(Math.ceil(Math.max(textWidth - containerWidth, 0)));
        }

        measureTicker();
        window.addEventListener("resize", measureTicker);
        return () => window.removeEventListener("resize", measureTicker);
    }, [currentTrack, nowPlaying.dj]);

    // check if reduced motion is on...and will disable the ticker if so
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);

        const handleChange = (event) => {
            setPrefersReducedMotion(event.matches);
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else if (mediaQuery.addListener) {
            mediaQuery.addListener(handleChange);
        }

        return () => {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleChange);
            } else if (mediaQuery.removeListener) {
                mediaQuery.removeListener(handleChange);
            }
        };
    }, []);

    // only animate if text overflows horizontally and motion is not reduced
    const shouldScrollTicker = tickerDistance > 0 && !prefersReducedMotion;

    return (
        <div className="fixed top-0 left-0 z-50 flex h-16 w-full flex-row items-center overflow-hidden border-b-2 border-[#e0ff05] bg-black">
            {/* The whole left box toggles the stream: from the page's left edge,
                across the label and waveform, up to the dividing border. */}
            <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause stream' : 'Play stream'}
                title={isPlaying ? 'Pause stream' : 'Play stream'}
                className="group flex h-full shrink-0 flex-row items-center gap-2 border-r border-[#e0ff05] px-4 transition-colors duration-150 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
                <span className="text-[#e0ff05] group-hover:text-yellow-200">
                    {isPlaying ? <FaPause size={18} /> : <FaPlay size={18} />}
                </span>

                <span className="bitcount text-base uppercase tracking-widest text-[#e0ff05]">
                    Stream Here
                </span>

                <span className="relative hidden shrink-0 items-center lg:flex">
                    {isHighQuality && (
                        <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                            <Emerald size={60} animated={isPlaying} />
                        </span>
                    )}
                    <img
                        src={isPlaying ? "/soundwaves.gif" : "/staticsoundwave.gif"}
                        alt=""
                        aria-hidden="true"
                        className="relative z-10"
                        style={{ height: "75px", width: "175px", objectFit: "cover" }}
                    />
                </span>
            </button>

            {/* The rest of the bar — all the blank space around the ticker —
                opens the /listen page, not just the text. */}
            <Link href="/listen" legacyBehavior>
                <a
                    className="group flex h-full min-w-0 flex-1 items-center overflow-hidden cursor-pointer transition-colors duration-150 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-label="Open listen page"
                    title="Open listen page"
                    onClick={(event) => {
                        event.currentTarget.blur();
                    }}
                >
                    <div ref={tickerContainerRef} className="w-full overflow-hidden">
                        <div
                            className={`inline-block whitespace-nowrap ${
                                shouldScrollTicker ? "animate-ticker-pingpong" : ""
                            }`}
                            style={{
                                "--ticker-distance": `${tickerDistance}px`
                            }}
                        >
                            <span
                                ref={tickerTextRef}
                                className="px-8 text-base font-semibold tracking-widest text-[#e0ff05] group-hover:text-white group-hover:underline group-focus:text-white group-focus:underline"
                            >
                                Currently Playing: {currentTrack} &nbsp;&nbsp;&nbsp;&nbsp; DJ ON AIR: {nowPlaying.dj}
                            </span>
                        </div>
                    </div>
                </a>
            </Link>
        </div>
    );
};

export default NavPlayer;
