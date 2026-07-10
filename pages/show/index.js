// Single show playlist page (the printplaylist.php analog).
// URL: /show?id=<showID> — client-fetched so it works in the static export.
// Renders in the same format as /current (a show-info card + dark track table).

import { useRouter } from "next/router";
import Link from "next/link";
import useShowPlaylist from "@/hooks/useShowPlaylist";
import PlaylistView from "@/components/PlaylistView";

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

    const { show, dj, tracks } = playlist;
    const djId = dj?.ID ?? show.userID;
    const djName = show.djname || dj?.defdjname || "Unknown DJ";
    const djNode = djId ? (
        <Link
            href={`/dj/?id=${djId}`}
            legacyBehavior={false}
            className="underline hover:text-blue-300"
        >
            {djName}
        </Link>
    ) : (
        djName
    );

    return (
        <div className="mx-auto w-5/6 pb-16 text-white">
            <div className="mb-8 mt-4">
                <h1 className="kallisto text-4xl lg:text-5xl">Playlist</h1>
            </div>

            <PlaylistView show={show} tracks={tracks} djNode={djNode} djName={show.djname || dj?.defdjname || null} />
        </div>
    );
}

function Message({ children }) {
    return (
        <div className="min-h-screen text-white flex items-center justify-center">
            <p className="kallisto text-lg">{children}</p>
        </div>
    );
}
