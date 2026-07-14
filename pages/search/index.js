// Site-wide search results page.
// URL: /search?q=<text>&pp=<playlists page>&sp=<shows page> — client-fetched for
// the static export. Two independently-paged sections: playlists (shows whose
// tracks match) and shows (whose title/subtitle match), 100 per page.

import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import { searchPlaylists, searchShows, SEARCH_PAGE_SIZE } from "@/lib/search";
import { showDate, showTime, showTitleOrDefault } from "@/lib/showFormat";

export default function SearchPage() {
    const router = useRouter();
    const q = router.isReady ? (router.query.q || "").toString() : "";
    const pp = router.isReady ? Math.max(parseInt(router.query.pp, 10) || 0, 0) : 0;
    const sp = router.isReady ? Math.max(parseInt(router.query.sp, 10) || 0, 0) : 0;

    const [playlists, setPlaylists] = useState([]);
    const [shows, setShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!router.isReady) return;
        const query = q.trim();
        if (!query) {
            setPlaylists([]);
            setShows([]);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const [playlistRows, showRows] = await Promise.all([
                    searchPlaylists(query, pp),
                    searchShows(query, sp),
                ]);
                if (!cancelled) {
                    setPlaylists(playlistRows);
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
    }, [router.isReady, q, pp, sp]);

    if (router.isReady && !q.trim()) {
        return <Message>Type something in the search box to find playlists and shows.</Message>;
    }
    if (!router.isReady || loading) {
        return <Message>Searching…</Message>;
    }
    if (error) {
        return <Message>Something went wrong with your search. Try again.</Message>;
    }

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <p className="text-base text-gray-300 tracking-wide">Search results for</p>
                <h1 className="text-4xl font-light leading-tight break-words px-4">
                    &ldquo;{q.trim()}&rdquo;
                </h1>
            </div>

            <div className="mx-auto w-full max-w-2xl px-4 space-y-12">
                <ResultsSection
                    title="Playlists containing your text"
                    emptyText="No playlists matched your text."
                    rows={playlists}
                    page={pp}
                    pageParam="pp"
                    q={q.trim()}
                    otherParam="sp"
                    otherValue={sp}
                />
                <ResultsSection
                    title="Shows matching your text"
                    emptyText="No show titles or subtitles matched your text."
                    rows={shows}
                    page={sp}
                    pageParam="sp"
                    q={q.trim()}
                    otherParam="pp"
                    otherValue={pp}
                />
            </div>
        </div>
    );
}

function ResultsSection({ title, emptyText, rows, page, pageParam, q, otherParam, otherValue }) {
    const hasPrev = page > 0;
    const hasNext = rows.length === SEARCH_PAGE_SIZE;

    // Build an href that changes only this section's page, preserving q and the
    // other section's page.
    const pageHref = (nextPage) => ({
        pathname: "/search",
        query: { q, [pageParam]: nextPage, [otherParam]: otherValue },
    });

    return (
        <section>
            <h2 className="mb-3 text-2xl font-light">{title}</h2>
            {rows.length === 0 ? (
                <p className="text-zinc-400">
                    {page > 0 ? "No more results." : emptyText}
                </p>
            ) : (
                <ul className="overflow-hidden rounded-lg border border-zinc-800 bg-black/80">
                    {rows.map((show) => (
                        <li key={show.ID} className="border-b border-zinc-800 last:border-b-0">
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
                                <span className="min-w-0">
                                    <span className="font-courierprime block text-white">
                                        {showTitleOrDefault(show, show.defdjname || show.djname)}
                                    </span>
                                    {(show.defdjname || show.djname) ? (
                                        <span className="block text-xs text-zinc-400">
                                            {show.defdjname || show.djname}
                                        </span>
                                    ) : null}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            {(hasPrev || hasNext) && (
                <div className="mt-4 flex items-center justify-between">
                    {hasPrev ? (
                        <Link href={pageHref(page - 1)} legacyBehavior={false} className="underline hover:no-underline">
                            ← Previous 100
                        </Link>
                    ) : (
                        <span />
                    )}
                    {hasNext ? (
                        <Link href={pageHref(page + 1)} legacyBehavior={false} className="underline hover:no-underline">
                            Next 100 →
                        </Link>
                    ) : (
                        <span />
                    )}
                </div>
            )}
        </section>
    );
}

function Message({ children }) {
    return (
        <div
            id="main-content"
            className="min-h-screen text-white flex items-center justify-center px-6 text-center"
        >
            <p className="kallisto text-lg">{children}</p>
        </div>
    );
}
