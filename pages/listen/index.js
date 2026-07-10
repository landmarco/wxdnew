// This is the listen page.

import Link from 'next/link'
import useCurrentPlaylist from '@/hooks/useCurrentPlaylist'
import NowPlayingHeader from "@/components/listenpage/NowPlayingHeader";
import NowPlayingListenPage from "@/components/listenpage/NowPlayingListenPage";
import StreamButton from "@/components/audioplayers/StreamButton";
import LastPlayed from '@/components/listenpage/LastPlayed'
import TodayShows from '@/components/listenpage/TodayShows'
import VinylPlayer from "@/components/homepage/VinylPlayer";
import MobileVinylPlayer from "@/components/homepage/MobileVinylPlayer";
import { useAudio } from "@/components/AudioContext";

export default function Listen() {

    const { currentPlaylist, loading } = useCurrentPlaylist();
    const { isPlaying, isHighQuality, setHighQuality, rejoinLive } = useAudio();

    return(
        <div className="min-h-screen text-white pb-2">
            
            <div className="flex flex-col items-center gap-4 px-4 pt-4 pb-6">
                {/* Desktop: current show info sits to the left of the vinyl player.
                    max-w-7xl (was 5xl) makes the vinyl widget ~25% larger. */}
                <div className="hidden w-full max-w-7xl lg:flex lg:items-stretch lg:gap-8">
                    <div className="w-1/3 min-w-0">
                        <NowPlayingListenPage currentPlaylist={currentPlaylist} />
                    </div>
                    <div className="w-2/3">
                        <VinylPlayer />
                    </div>
                </div>
                {/* Mobile: current show info stacked above the vinyl player.
                    max-w-[35rem] (was md/28rem) makes the vinyl widget ~25% larger. */}
                <div className="w-full max-w-[35rem] lg:hidden">
                    <NowPlayingHeader currentPlaylist={currentPlaylist} />
                    <div className="mt-4">
                        <MobileVinylPlayer />
                    </div>
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
                <div className="mt-10 flex justify-center pb-6">
                    <button
                        type="button"
                        onClick={() => setHighQuality(true)}
                        className="font-courierprime rounded border border-emerald-500/60 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
                    >
                        Gimme the 320 kbps stream
                    </button>
                </div>
            )}

            <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 md:grid-cols-[minmax(0,1fr)_360px]">
				<div className="listen-scrollbar h-auto min-w-0 md:h-[calc(100vh-160px)] md:overflow-auto">
					<LastPlayed currentPlaylist={currentPlaylist} />
				</div>
				<div className="listen-scrollbar flex h-auto justify-center md:h-[calc(100vh-160px)] md:overflow-auto md:border-l md:border-gray-700 md:pl-8">
					<TodayShows />
				</div>
			</div>
            
        </div>
    )
}
