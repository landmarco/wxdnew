// This component displays the current show and dj playing, plus a link to the
// previous-shows archive. Centered on mobile, left-aligned beside the vinyl
// player on desktop.

import Link from "next/link";

export default function NowPlayingHeader({ currentPlaylist = {} }) {

    const show = currentPlaylist.show || {};
    const dj = currentPlaylist.dj || {};

    const djname = show.djname || dj.defdjname || "";
    const title = show.title || "";
    // user ID for the DJ's show-list page; present on the current-playlist payload
    const djId = dj.ID ?? show.userID;

    return(
        <div className="text-center lg:text-left">
            <h1 className="text-3xl font-light leading-tight break-words">
                DJ:{" "}
                {djId && djname ? (
                    <Link href={`/dj/?id=${djId}`} legacyBehavior={false} className="underline hover:no-underline">
                        {djname}
                    </Link>
                ) : (
                    djname
                )}
            </h1>
            <h4 className="text-xl text-gray-300 mt-1 break-words">
                Show:{" "}
                {title ? (
                    <Link href="/current/" legacyBehavior={false} className="underline hover:no-underline">
                        {title}
                    </Link>
                ) : (
                    title
                )}
            </h4>
            <p className="mt-3">
                <Link href="/previous-shows/" legacyBehavior={false} className="underline hover:no-underline text-gray-300">
                    explore any past show
                </Link>
            </p>
        </div>
    )
}
