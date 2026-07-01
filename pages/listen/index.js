// This is the listen page.

import Link from 'next/link'
import useCurrentPlaylist from '@/hooks/useCurrentPlaylist'
import NowPlayingHeader from '@/components/listenpage/NowPlayingHeader'
import {useAudio} from '@/components/AudioContext'
import NowPlaying from '@/components/listenpage/NowPlaying'
import LastPlayed from '@/components/listenpage/LastPlayed'
import TodayShows from '@/components/listenpage/TodayShows'

export default function Listen() {
	const {currentPlaylist} = useCurrentPlaylist()
	const {isHighQuality, setHighQuality} = useAudio()

	return (
		<div className="min-h-screen pb-2 text-white">
			<NowPlayingHeader currentPlaylist={currentPlaylist} />

			<p className="mt-2 text-center">
				<Link
					href="/listen/past-10-days/"
					legacyBehavior={false}
					className="text-gray-300 underline hover:no-underline"
				>
					Past 10 days
				</Link>
			</p>

			<NowPlaying currentPlaylist={currentPlaylist} />
			
            {!isHighQuality && (
				<div className="mt-10 flex justify-center pb-6">
					<button
						type="button"
						onClick={() => setHighQuality(true)}
						className="rounded border border-emerald-500/60 px-4 py-2 font-courierprime text-sm text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
					>
						Gimme the 320 kbps stream
					</button>
				</div>
			)}

			<div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-4 md:grid-cols-[minmax(0,1fr)_360px]">
				<div className="h-auto min-w-0 md:h-[calc(100vh-160px)] md:overflow-auto">
					<LastPlayed currentPlaylist={currentPlaylist} />
				</div>
				<div className="flex h-auto justify-center md:h-[calc(100vh-160px)] md:overflow-auto md:border-l md:border-gray-700 md:pl-8">
					<TodayShows />
				</div>
			</div>
		</div>
	)
}
