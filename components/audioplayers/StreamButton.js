import React from 'react'
import { FaPlay, FaPause } from 'react-icons/fa'
import { useAudio } from '../AudioContext'

const StreamButton = () => {
    const { isPlaying, togglePlayPause } = useAudio()

    return (
        <button
            onClick={togglePlayPause}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 hover:bg-red-600 py-[3%] font-courierprime text-[3vw] text-[#white] transition-opacity hover:opacity-80 lg:text-[15px]">
                {isPlaying ? 'pause' : 'stream here'}
                <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-white/20">
                {isPlaying ? <FaPause size={18} className="text-white" /> : <FaPlay size={18} className="text-white pl-0.5" />}
                </div>
        </button>
    )
}

export default StreamButton