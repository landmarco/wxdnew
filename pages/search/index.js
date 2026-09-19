// Site-wide search results page.
// URL: /search?q=<text>&pp=<playlists page>&sp=<shows page> — client-fetched for
// the static export. Two independently-paged sections: playlists (shows whose
// tracks match) and shows (whose title/subtitle/sub-genre match), 100 per page.
//
// `q` may repeat, and `dj` may carry comma-separated DJ ids:
//
//   /search/?q=local%20music%20hour            one term (the plain search box)
//   /search/?q=local%20music%20hour&q=local    either term
//   /search/?q=local&dj=900                    that term, or anything DJ 900 did
//   ...&in=shows                               show fields only, no tracklists
//
// Schedule cells link here via lib/djLink.js when their schedule.csv entry pins
// quoted terms instead of a DJ id.
//
// One term with no DJ ids keeps the original server-paged path exactly. More than
// one source can't be paged by the server (the API has no OR across terms), so
// those are merged in lib/search.js and paged client-side over the merged rows.

import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AiFillTag } from "react-icons/ai";
import {
    searchPlaylists,
    searchShows,
    searchPlaylistsCombined,
    searchShowsCombined,
    SEARCH_PAGE_SIZE,
} from "@/lib/search";
import { showDate, showTime, showTitleOrDefault, showSubGenre } from "@/lib/showFormat";
import { getDj } from "@/lib/djShows";

// A repeated query param arrives as an array, a single one as a string.
function toArray(value) {
    if (value == null) return [];
    return (Array.isArray(value) ? value : [value])
        .map((v) => String(v).trim())
        .filter(Boolean);
}

function parseDjIds(value) {
    return toArray(value)
        .flatMap((v) => v.split(","))
        .map((part) => parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
}

// ["a", "b", "c"] -> `a, b <joiner> c`
function formatList(items, joiner) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + ` ${joiner} ` + items[items.length - 1];
}

// "a", "b" or "c" -> for the results heading
function joinTerms(terms) {
    return formatList(terms.map((t) => `\u201C${t}\u201D`), "or");
}

export default function SearchPage() {
    const router = useRouter();
    const terms = useMemo(
        () => (router.isReady ? toArray(router.query.q) : []),
        [router.isReady, router.query.q]
    );
    const djIds = useMemo(
        () => (router.isReady ? parseDjIds(router.query.dj) : []),
        [router.isReady, router.query.dj]
    );
    const pp = router.isReady ? Math.max(parseInt(router.query.pp, 10) || 0, 0) : 0;
    const sp = router.isReady ? Math.max(parseInt(router.query.sp, 10) || 0, 0) : 0;

    // More than one source to union means the server can't page it for us.
    const combined = terms.length > 1 || djIds.length > 0;
    const hasQuery = terms.length > 0 || djIds.length > 0;

    // Schedule links pass in=shows: match show fields only, never tracklists.
    const showsOnly = router.isReady && String(router.query.in || "") === "shows";

    const [playlists, setPlaylists] = useState({ rows: [], truncated: false });
    const [shows, setShows] = useState({ rows: [], truncated: false });
    const [djNames, setDjNames] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Stable primitives so the effect doesn't refire on identical arrays. In
    // combined mode the page params are held at 0: paging happens over rows we
    // already hold, so changing page must not refetch.
    const termsKey = terms.join("\u0000");
    const djKey = djIds.join(",");
    const fetchPp = combined ? 0 : pp;
    const fetchSp = combined ? 0 : sp;

    useEffect(() => {
        if (!router.isReady) return;
        if (!hasQuery) {
            setPlaylists({ rows: [], truncated: false });
            setShows({ rows: [], truncated: false });
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const emptyResult = { rows: [], truncated: false };
                const [playlistResult, showResult] = await Promise.all([
                    // Skipped entirely when the page won't render them, so a
                    // schedule click costs no tracklist queries at all.
                    showsOnly
                        ? emptyResult
                        : combined
                          ? searchPlaylistsCombined(terms)
                          : searchPlaylists(terms[0], fetchPp).then((rows) => ({ rows, truncated: false })),
                    combined
                        ? searchShowsCombined(terms, djIds)
                        : searchShows(terms[0], fetchSp).then((rows) => ({ rows, truncated: false })),
                ]);
                if (!cancelled) {
                    setPlaylists(playlistResult);
                    setShows(showResult);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router.isReady, hasQuery, combined, showsOnly, termsKey, djKey, fetchPp, fetchSp]);

    // Resolve DJ ids to names for the heading — "plus everything from DJ 900" is
    // meaningless to a listener. Failures fall back to the id, so the heading
    // still says something true if the lookup is down.
    useEffect(() => {
        if (!djIds.length) {
            setDjNames({});
            return;
        }
        let cancelled = false;
        Promise.all(
            djIds.map((id) =>
                getDj(id)
                    .then((dj) => [id, dj?.defdjname || dj?.djname || null])
                    .catch(() => [id, null])
            )
        ).then((pairs) => {
            if (!cancelled) setDjNames(Object.fromEntries(pairs));
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [djKey]);

    if (router.isReady && !hasQuery) {
        return <Message>Type something in the search box to find playlists and shows.</Message>;
    }
    if (!router.isReady || loading) {
        return <Message>Searching…</Message>;
    }
    if (error) {
        return (
            <Message>
                {error.code === "ETIMEDOUT"
                    ? "The search took too long to answer. Check your connection and try again."
                    : "Something went wrong with your search. Try again."}
            </Message>
        );
    }

    // Combined mode holds every merged row, so this page's slice is taken here.
    // Single-term mode already receives exactly one page from the server.
    const pageSlice = (result, page) =>
        combined
            ? result.rows.slice(page * SEARCH_PAGE_SIZE, (page + 1) * SEARCH_PAGE_SIZE)
            : result.rows;
    const hasNextPage = (result, page) =>
        combined
            ? result.rows.length > (page + 1) * SEARCH_PAGE_SIZE
            : result.rows.length === SEARCH_PAGE_SIZE;

    const djLabels = djIds.map((id) => djNames[id] || `DJ ${id}`);
    const heading = terms.length ? joinTerms(terms) : formatList(djLabels, "and");
    const alsoDjs = terms.length && djIds.length
        ? `plus everything from ${formatList(djLabels, "and")}`
        : "";

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <p className="text-base text-gray-300 tracking-wide">Search results for</p>
                <h1 className="text-4xl font-light leading-tight break-words px-4">
                    {heading}
                </h1>
                {alsoDjs ? (
                    <p className="mt-2 text-sm text-zinc-400 px-4">({alsoDjs})</p>
                ) : null}
            </div>

            <div className="mx-auto w-full max-w-2xl px-4 space-y-12">
                {showsOnly ? null : (
                    <ResultsSection
                        title="Playlists containing your text"
                        emptyText="No playlists matched your text."
                        rows={pageSlice(playlists, pp)}
                        hasNext={hasNextPage(playlists, pp)}
                        truncated={playlists.truncated}
                        page={pp}
                        pageParam="pp"
                        terms={terms}
                        djIds={djIds}
                        showsOnly={showsOnly}
                        otherParam="sp"
                        otherValue={sp}
                    />
                )}
                <ResultsSection
                    title="Shows matching your text"
                    emptyText="No show titles, subtitles or sub-genres matched your text."
                    rows={pageSlice(shows, sp)}
                    hasNext={hasNextPage(shows, sp)}
                    truncated={shows.truncated}
                    page={sp}
                    pageParam="sp"
                    terms={terms}
                    djIds={djIds}
                    showsOnly={showsOnly}
                    otherParam="pp"
                    otherValue={pp}
                />
            </div>
        </div>
    );
}

function ResultsSection({
    title, emptyText, rows, hasNext, truncated, page, pageParam, terms, djIds, showsOnly, otherParam, otherValue,
}) {
    const hasPrev = page > 0;

    // Build an href that changes only this section's page, preserving every term,
    // the DJ ids and the other section's page.
    const pageHref = (nextPage) => ({
        pathname: "/search",
        query: {
            q: terms,
            ...(djIds.length ? { dj: djIds.join(",") } : {}),
            ...(showsOnly ? { in: "shows" } : {}),
            [pageParam]: nextPage,
            [otherParam]: otherValue,
        },
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
                    {rows.map((show) => {
                        const subGenre = showSubGenre(show);
                        return (
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
                                    {/* Surfaces the sub-genre a result may have matched
                                        on, which is otherwise invisible here. */}
                                    {subGenre ? (
                                        <span className="mt-1 inline-flex items-center rounded-full border border-zinc-600 py-0.5 pl-1 pr-2 text-xs text-zinc-300">
                                            <AiFillTag size={12} className="mr-1" />
                                            {subGenre}
                                        </span>
                                    ) : null}
                                </span>
                            </Link>
                        </li>
                        );
                    })}
                </ul>
            )}

            {truncated && (
                <p className="mt-3 text-xs text-zinc-500">
                    Showing the most recent matches only — one of these terms has more
                    results than we fetch at once. Narrow the term to see older shows.
                </p>
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
