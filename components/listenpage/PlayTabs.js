// This component contains the tabs to switch between viewing now playing and last played songs.

import {useState} from "react";
import NowPlaying from "./NowPlaying";
import CurrentPlaylist from "./CurrentPlaylist";

export default function PlayTabs({ nowPlaying = {}, currentPlaylist = {}}) {
    const [activeTab, setActiveTab] = useState("nowplaying");

    // To render the correct tab based on the activeTab state (i.e which tab the user has clicked on)
    function renderTab() {
        if (activeTab === "nowplaying") {
            return <NowPlaying currentPlaylist={currentPlaylist} />
        } else if (activeTab === "currentPlaylist") {
            return <CurrentPlaylist currentPlaylist={currentPlaylist}/>
        }
    }

    return(
        <div className="w-full max-w-[360px] mx-auto">
            <div role="tablist" className="flex justify-center">
                <button role="tab" onClick={() => setActiveTab("nowplaying")} aria-selected={activeTab === 'nowplaying'} className={activeTab === "nowplaying" ? "text-white border-b-2 border-blue-400 px-4 py-2 text-lg" : "text-gray-300 hover:text-white transition-colors duration-150 px-4 py-2 text-lg"}>
                    Now Playing
                </button>
                <button role="tab" onClick={() => setActiveTab("currentPlaylist")} aria-selected={activeTab === 'currentPlaylist'} className={activeTab === "currentPlaylist" ? "text-white border-b-2 border-blue-400 px-4 py-2 text-lg" : "text-gray-300 hover:text-white transition-colors duration-150 px-4 py-2 text-lg"}>
                    Current Playlist
                </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
                {renderTab()}
            </div>
        </div>
    )
}