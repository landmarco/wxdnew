// This component displayed the current playlist.
import SongRow from "./songRow"

export default function CurrentPlaylist({ currentPlaylist = {}}) {


    // getting current playlist track and reversing it so that the latest song shows first
    const tracks = currentPlaylist.tracks || [];
    return(
        <div className="w-full max-w-[360px] mx-auto">
            <div className="flex justify-center">
                <div className="w-full max-w-sm">
                    {tracks.map((item, i) => (
                        <SongRow key={i} song={item.song} artist={item.artist} album={item.album} songStart={item.songstart} cover={item.cover} />
                    ))}
                </div>
            </div>
        </div>
    )
}
