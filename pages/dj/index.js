// DJ show-list page (the djplaylists.php analog).
// URL: /dj?id=<userID>&page=<0-based> — client-fetched for the static export.
// Shows up to 100 shows per page with Previous / Next controls.

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getDj, getDjShows, DJ_SHOWS_PAGE_SIZE } from "@/lib/djShows";
import { showDate, showTime } from "@/lib/showFormat";

export default function DjPage() {
    const router = useRouter();
    const djId = router.isReady ? router.query.id : undefined;
    const page = router.isReady ? Math.max(parseInt(router.query.page, 10) || 0, 0) : 0;

    const [dj, setDj] = useState(null);
    const [shows, setShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!router.isReady || !djId) return;

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const [djInfo, showRows] = await Promise.all([
                    getDj(djId),
                    getDjShows(djId, page),
                ]);
                if (!cancelled) {
                    setDj(djInfo);
                    setShows(showRows);
                }
            } catch (err) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [router.isReady, djId, page]);

    if (router.isReady && !djId) {
        return <Message>No DJ specified.</Message>;
    }
    if (!router.isReady || loading) {
        return <Message>Loading shows…</Message>;
    }
    if (error) {
        return <Message>Couldn&apos;t load this DJ&apos;s shows.</Message>;
    }

    // /api/djs/:id returns an array when several ids are requested (a multi-DJ
    // show), or a single object for one id. Normalize to a list and join names.
    const djList = Array.isArray(dj) ? dj : dj ? [dj] : [];
    const djName =
        djList.map((d) => d?.defdjname).filter(Boolean).join(", ") ||
        shows[0]?.djname ||
        "this DJ";
    // only show a subtitle/title for a single DJ (ambiguous for a group)
    const deftitle = djList.length === 1 ? djList[0]?.deftitle : null;

    const hasPrev = page > 0;
    const hasNext = shows.length === DJ_SHOWS_PAGE_SIZE;

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <p className="text-base text-gray-300 tracking-wide">Shows by</p>
                <h1 className="text-4xl font-light leading-tight">{djName}</h1>
                {deftitle ? (
                    <p className="text-lg text-gray-300 mt-1">{deftitle}</p>
                ) : null}
            </div>

            <div className="mx-auto w-full max-w-2xl px-4">
                {shows.length === 0 ? (
                    <p className="text-center text-zinc-400">
                        {page > 0 ? "No more shows." : "No shows found for this DJ."}
                    </p>
                ) : (
                    <ul className="border border-zinc-800">
                        {shows.map((show) => (
                            <li
                                key={show.ID}
                                className="border-b border-zinc-800 last:border-b-0"
                            >
                                <Link
                                    href={`/show/?id=${show.ID}`}
                                    legacyBehavior={false}
                                    className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-900 sm:flex-row sm:items-baseline sm:gap-4"
                                >
                                    <span className="w-44 flex-shrink-0 text-sm text-zinc-400">
                                        {showDate(show.starttime)}
                                        {show.starttime ? (
                                            <span className="block text-xs text-zinc-500">
                                                {showTime(show.starttime)}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="font-courierprime text-white">
                                        {show.title || "Untitled show"}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}

                {(hasPrev || hasNext) && (
                    <div className="mt-6 flex items-center justify-between">
                        {hasPrev ? (
                            <Link
                                href={`/dj/?id=${djId}&page=${page - 1}`}
                                legacyBehavior={false}
                                className="underline hover:no-underline"
                            >
                                ← Previous 100
                            </Link>
                        ) : (
                            <span />
                        )}
                        {hasNext ? (
                            <Link
                                href={`/dj/?id=${djId}&page=${page + 1}`}
                                legacyBehavior={false}
                                className="underline hover:no-underline"
                            >
                                Next 100 →
                            </Link>
                        ) : (
                            <span />
                        )}
                    </div>
                )}
            </div>
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
