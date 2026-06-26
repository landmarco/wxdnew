// Single show playlist page (the printplaylist.php analog).
// URL: /show?id=<showID> — client-fetched so it works in the static export.

import { useRouter } from "next/router";
import Link from "next/link";
import useShowPlaylist from "@/hooks/useShowPlaylist";
import CurrentPlaylist from "@/components/listenpage/CurrentPlaylist";
import { showDateTime } from "@/lib/showFormat";

export default function ShowPage() {
    const router = useRouter();
    // wait for the client-side router before reading the query string
    const showId = router.isReady ? router.query.id : undefined;

    const { playlist, loading, error } = useShowPlaylist(showId);

    if (router.isReady && !showId) {
        return <Message>No show specified.</Message>;
    }
    if (!router.isReady || loading) {
        return <Message>Loading playlist…</Message>;
    }
    if (error || !playlist?.show) {
        return <Message>Playlist not found.</Message>;
    }

    const { show, dj } = playlist;
    const djId = dj?.ID ?? show.userID;
    const djName = show.djname || dj?.defdjname || "Unknown DJ";

    return (
        <div id="main-content" className="min-h-screen text-white pb-6">
            <div className="text-center py-6">
                <p className="text-base text-gray-300 tracking-wide">Playlist</p>
                <h1 className="text-4xl font-light leading-tight">
                    {show.title || "Untitled show"}
                </h1>
                <h2 className="text-xl text-gray-300 mt-1">
                    DJ:{" "}
                    {djId ? (
                        <Link
                            href={`/dj/?id=${djId}`}
                            legacyBehavior={false}
                            className="underline hover:no-underline"
                        >
                            {djName}
                        </Link>
                    ) : (
                        djName
                    )}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                    {showDateTime(show.starttime)}
                </p>
            </div>

            {playlist.tracks.length ? (
                <CurrentPlaylist currentPlaylist={playlist} />
            ) : (
                <p className="text-center text-zinc-400">
                    No tracks were logged for this show.
                </p>
            )}
        </div>
    );
}

function Message({ children }) {
    return (
        <div
            id="main-content"
            className="min-h-screen text-white flex items-center justify-center"
        >
            <p className="kallisto text-lg">{children}</p>
        </div>
    );
}
