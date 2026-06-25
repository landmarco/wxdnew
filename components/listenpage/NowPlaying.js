// This component displays the song that is currently playing.

import { useState, useEffect } from 'react';
import Image from "next/image"
import StreamButton from "../audioplayers/StreamButton"

const FILLER_IMAGE = '/CD_1_Filler.jpg';

export default function NowPlaying({ currentPlaylist = {} }) {

    // getting the current track
    const track = currentPlaylist.tracks?.[0] || {};

    // checking if track returns something. And default value in case it doesn't    
    const song = track?.song || "";
    const artist = track?.artist || "";
    const album = track?.album || "";
    const cover = track?.cover || FILLER_IMAGE;

    return(
        <div className="w-full max-w-[320px] mx-auto">
            <Image
                src={cover}
                alt="Album Art"
                width={150}
                height={150}
                className="w-full h-auto object-cover rounded-sm"
            />
            {track ?
                (<>
                    <p className="mt-4 text-xl text-white">Song: {song}</p>
                    <p>Artist: {artist}</p>
                    <p className="text-lg text-gray-300 mt-1">Album: {album}</p>
                </>
                ) : 
                (
                    <p className="mt-4 text-xl text-white">it&apos;s a secret... tune in to find out</p>
                )
            }

            <div className="flex justify-center">
                <div className="w-full max-w-sm">
                    <StreamButton />
                </div>
            </div>
        </div>
        
    )
}

