import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FaPause, FaPlay } from "react-icons/fa";
import { useAudio } from "../AudioContext";
import { subscribeNowPlaying } from "../../lib/nowPlaying";
import getCovers from "../../lib/getCovers";
import cardinalsFallback from "../../images/cardinals.jpg";
import Emerald from "../Emerald";

// Lock-screen / Android Auto artwork. When false, always use the cardinals cover
// (matching the Recently Played iPod widget's fallback). Flip to true to use each
// track's real cover art (fetched below) and fall back to cardinals when none.
const USE_REAL_COVER_ART = false;

const NavPlayer = () => {
    const { isPlaying, isStalled, isRejoining, isPreloading, qualitySwitch, togglePlayPause, isHighQuality } = useAudio();

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

    // Cover art for the currently playing track, used for lock-screen / car
    // metadata. Only populated when USE_REAL_COVER_ART is on; otherwise we always
    // show the cardinals fallback below.
    const [nowPlayingCover, setNowPlayingCover] = useState(null);

    // Subscribe to live now-playing updates. This prefers the server's SSE
    // stream (api.wxdu.art / api.wxdu.org), which pushes only when the track or
    // show changes, and transparently falls back to polling if the stream is
    // unavailable. The old /api/now-playing Next route doesn't exist in the
    // static export, so this goes straight to the external API.
    useEffect(() => {
        const unsubscribe = subscribeNowPlaying((data) => {
            setNowPlaying({
                artist: data.artist,
                song: data.song,
                album: data.album,
                dj: data.dj
            });
        });
        return unsubscribe;
    }, []);

    // Look up the current track's cover art (by artist + album) for the OS media
    // metadata. Gated behind USE_REAL_COVER_ART so we don't even hit the API
    // while the cardinals image is forced on.
    useEffect(() => {
        if (!USE_REAL_COVER_ART) return;
        if (!nowPlaying.artist || !nowPlaying.album) {
            setNowPlayingCover(null);
            return;
        }
        let cancelled = false;
        getCovers(nowPlaying.artist, null, nowPlaying.album).then((url) => {
            if (!cancelled) setNowPlayingCover(url || null);
        });
        return () => {
            cancelled = true;
        };
    }, [nowPlaying.artist, nowPlaying.album]);

    // Publish now-playing metadata to the OS (lock screen, Android Auto, etc.).
    // Artwork is the track's real cover when enabled and found, otherwise the
    // cardinals image — resolved to an absolute URL, which some platforms require.
    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

        const cover = USE_REAL_COVER_ART && nowPlayingCover ? nowPlayingCover : cardinalsFallback.src;
        const artworkUrl =
            cover.startsWith("http") || typeof window === "undefined"
                ? cover
                : window.location.origin + cover;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: nowPlaying.song || "WXDU 88.7 FM",
            artist: nowPlaying.artist || "WXDU",
            album: nowPlaying.album || "Durham, NC",
            artwork: [
                { src: artworkUrl, sizes: "512x512", type: "image/jpeg" },
            ],
        });
    }, [nowPlaying.song, nowPlaying.artist, nowPlaying.album, nowPlayingCover]);

    // Keep the OS playback state in sync and route its play/pause controls back
    // into our single stream toggle.
    useEffect(() => {
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

        const onPlay = () => {
            if (!isPlaying) togglePlayPause();
        };
        const onPause = () => {
            if (isPlaying) togglePlayPause();
        };

        const setHandler = (action, handler) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch {
                // some platforms don't support every action — ignore
            }
        };

        setHandler("play", onPlay);
        setHandler("pause", onPause);
        setHandler("stop", onPause);

        return () => {
            setHandler("play", null);
            setHandler("pause", null);
            setHandler("stop", null);
        };
    }, [isPlaying, togglePlayPause]);

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

    // The status label that rides over the oscillation on desktop. Priority: a
    // deliberate quality switch, then a mid-play stall/rejoin, then the initial
    // cold-connect warm-up. Null when the stream is simply playing or paused.
    const overlayText = qualitySwitch
        ? (qualitySwitch === "toHigh" ? "My Emerald!" : "Relinquishing")
        : isStalled || isRejoining
        ? (isRejoining ? "Rejoining" : "Reconnecting")
        : isPreloading && !isStalled
        ? "Lichenizing"
        : null;

    // On mobile there's no oscillation, so the same label temporarily replaces the
    // "Stream Here" text instead — except the initial "Lichenizing" warm-up, which
    // is intentionally silent on mobile.
    const mobileOverlay = overlayText && overlayText !== "Lichenizing" ? overlayText : null;
    const mobileLabel = mobileOverlay || "Stream Here";

    return (
        <div className="fixed left-0 top-0 z-50 flex h-16 w-full flex-row items-center overflow-hidden border-b-2 border-[#e0ff05] bg-black">
            {/* The whole left box toggles the stream: from the page's left edge,
                across the label and waveform, up to the dividing border. */}
            <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? 'Pause stream' : 'Play stream'}
                title={isPlaying ? 'Pause stream' : 'Play stream'}
                className="group flex h-full shrink-0 flex-row items-center gap-2 border-r border-[#e0ff05] px-4 transition-colors duration-150 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
                <span className="relative text-[#e0ff05] group-hover:text-yellow-200">
                    {isPlaying ? <FaPause size={18} /> : <FaPlay size={18} />}
                    {/* Mobile/tablet warm-up indicator: a mossy green ring that
                        creeps round the icon while the stream buffers. Stall/rejoin/
                        quality-switch states surface as the label text on mobile (see
                        below), so they don't need a ring; the cold-connect warm-up is
                        silent on mobile except for this subtle ring. */}
                    {isPreloading && !isStalled && (
                        <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -inset-2 animate-spin rounded-full border-2 border-dashed border-[#6b8e23] lg:hidden"
                            style={{ animationDuration: "3s" }}
                        />
                    )}
                </span>

                {/* Desktop: a fixed "Stream Here" label; the oscillation and its
                    overlay/emerald sit to the right of it. */}
                <span className="bitcount hidden text-base uppercase tracking-widest text-[#e0ff05] lg:inline">
                    Stream Here
                </span>

                {/* Mobile: the label doubles as the status readout. Any overlay text
                    that rides over the desktop oscillation temporarily replaces
                    "Stream Here" here instead (styled like the desktop overlay), and
                    the HQ emerald glows behind it — mirroring the desktop emerald
                    behind the oscillation. */}
                <span className="relative flex items-center lg:hidden">
                    {isHighQuality && (
                        <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                            <Emerald size={60} animated={isPlaying} />
                        </span>
                    )}
                    <span
                        className={`bitcount relative z-10 whitespace-nowrap uppercase text-[#e0ff05] ${
                            mobileOverlay
                                ? "animate-pulse text-xl tracking-tight"
                                : "text-base tracking-widest"
                        }`}
                        style={mobileOverlay ? { textShadow: "0 0 6px #000, 0 0 6px #000" } : undefined}
                    >
                        {mobileLabel}
                    </span>
                </span>

                <span className="relative hidden shrink-0 items-center lg:flex">
                    {isHighQuality && (
                        <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                            <Emerald size={60} animated={isPlaying} />
                        </span>
                    )}
                    {/* Animated GIF with fixed dimensions; next/image can't optimize
                        GIFs and images are unoptimized in next.config anyway. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={isPlaying ? "/soundwaves.gif" : "/staticsoundwave.gif"}
                        alt=""
                        aria-hidden="true"
                        className="relative z-10"
                        style={{ height: "75px", width: "175px", objectFit: "cover" }}
                    />

                    {/* A single status label rides over the oscillation: "MY EMERALD!"
                        / "RELINQUISHING" during a quality switch, "RECONNECTING" /
                        "REJOINING" for a mid-play stall or catch-up, "LICHENIZING" for
                        the cold-connect warm-up (see overlayText for the priority). */}
                    {overlayText && (
                        <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-1">
                            <span
                                className="bitcount animate-pulse whitespace-nowrap text-xl uppercase tracking-tight text-[#e0ff05]"
                                style={{ textShadow: "0 0 6px #000, 0 0 6px #000" }}
                            >
                                {overlayText}
                            </span>
                        </span>
                    )}
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
                                className="px-4 text-sm font-semibold tracking-widest text-[#e0ff05] group-hover:text-white group-hover:underline group-focus:text-white group-focus:underline md:px-8 md:text-base"
                            >
                                <span className="inline md:hidden">Now: </span>
                                <span className="hidden md:inline">Currently Playing: </span>
                                {currentTrack} &nbsp;&nbsp;&nbsp;&nbsp; DJ ON AIR: {nowPlaying.dj}
                            </span>
                        </div>
                    </div>
                </a>
            </Link>
        </div>
    );
};

export default NavPlayer;
