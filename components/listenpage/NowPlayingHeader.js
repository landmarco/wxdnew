// This component displays the current show and dj playing.

import Link from "next/link";

export default function NowPlayingHeader({ currentPlaylist = {} }) {

    const show = currentPlaylist.show || {};
    const dj = currentPlaylist.dj || {};

    const djname = show.djname || dj.defdjname || "";
    const title = show.title || "";
    // user ID for the DJ's show-list page; present on the current-playlist payload
    const djId = dj.ID ?? show.userID;

    return(
        <>
            <p className="text-base text-center text-gray-300 tracking-wide">
                Current Show
            </p>
            <h1 className="text-5xl text-center font-light leading-tight">
                DJ:{" "}
                {djId && djname ? (
                    <Link href={`/dj/?id=${djId}`} legacyBehavior={false} className="underline hover:no-underline">
                        {djname}
                    </Link>
                ) : (
                    djname
                )}
            </h1>
            <h4 className="text-2xl text-center text-gray-300 mt-1">
                    Show: {title}
            </h4>
        </>

    )
}
