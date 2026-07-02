// This is the listen page.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import useCurrentPlaylist from '@/hooks/useCurrentPlaylist'
import NowPlayingHeader from "@/components/listenpage/NowPlayingHeader";
import StreamButton from "@/components/audioplayers/StreamButton";
import PlayTabs from "@/components/listenpage/PlayTabs";
import ExploreTab from "@/components/listenpage/ExploreTab";
import { useAudio } from "@/components/AudioContext";

export default function Listen() {

    const { currentPlaylist, loading } = useCurrentPlaylist();
    const { isPlaying, isHighQuality, setHighQuality, rejoinLive } = useAudio();

    return(
        <div className="min-h-screen text-white pb-2">
            <NowPlayingHeader currentPlaylist={currentPlaylist} />

            <p className="text-center mt-2">
                <Link href="/listen/past-10-days/" legacyBehavior={false} className="underline hover:no-underline text-gray-300">
                    Past 10 days
                </Link>
            </p>

            <div className="grid grid-cols-1 md:grid-cols-[40%_60%] gap-8">
                <div className="md:h-[calc(100vh-160px)] md:overflow-auto h-auto flex justify-center">
                    <div className="w-full max-w-[360px]">
                        <PlayTabs currentPlaylist={currentPlaylist}/>
                    </div>
                </div>

                <div className="md:h-[calc(100vh-160px)] md:overflow-auto h-auto border-l border-gray-700 pl-8 flex justify-center">
                    <ExploreTab />
                </div>
            </div>

            <div className="mt-10 flex justify-center">
                <button
                    type="button"
                    onClick={rejoinLive}
                    disabled={!isPlaying}
                    title={isPlaying ? "Resync to the live stream" : "Start the stream to resync"}
                    className="font-courierprime rounded border border-orange-500/60 px-4 py-2 text-sm text-orange-300 transition-colors hover:bg-orange-500/10 hover:text-orange-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-orange-300"
                >
                    Resync to the live stream
                </button>
            </div>

            {!isHighQuality && (
                <div className="mt-4 flex justify-center pb-6">
                    <button
                        type="button"
                        onClick={() => setHighQuality(true)}
                        className="font-courierprime rounded border border-emerald-500/60 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                    >
                        Gimme the 320 kbps stream
                    </button>
                </div>
            )}
        </div>
    )
}

