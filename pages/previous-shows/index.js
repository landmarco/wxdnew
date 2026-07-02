// "Previous shows" page (replaces the old /listen/past-10-days).
// URL: /previous-shows — client-fetched list of past shows grouped by day.
// Browses 10 days at a time and steps backward/forward through the archive, and
// includes a calendar for jumping straight to a specific day or date range.
// A ?start=YYYY-MM-DD&end=YYYY-MM-DD window can be passed in the URL (shareable).

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { getShowsInRange } from "@/lib/previousShows";
import {
    showTime,
    showDayKey,
    dayKeyLabel,
    todayDayKey,
    shiftDayKey,
    dayKeySpan,
} from "@/lib/showFormat";
import PreviousShowsCalendar from "@/components/listenpage/PreviousShowsCalendar";

const WINDOW_DAYS = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// group the flat (newest-first) show list into ordered day sections
function groupByDay(shows) {
    const groups = [];
    const byKey = new Map();
    for (const show of shows) {
        const key = showDayKey(show.starttime);
        let group = byKey.get(key);
        if (!group) {
            group = { key, shows: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.shows.push(show);
    }
    return groups;
}

// human label for the window heading, e.g. "Jun 23 – Jul 2, 2026"
function windowLabel(startDay, endDay) {
    if (startDay === endDay) {
        return dayKeyLabel(startDay, { year: "numeric" });
    }
    return `${dayKeyLabel(startDay)} – ${dayKeyLabel(endDay, { year: "numeric" })}`;
}

export default function PreviousShows() {
    const router = useRouter();
    const today = todayDayKey();

    // Resolve the active window from the URL, falling back to the last 10 days.
    const qStart = router.query.start;
    const qEnd = router.query.end;
    const hasRange =
        typeof qStart === "string" &&
        typeof qEnd === "string" &&
        DATE_RE.test(qStart) &&
        DATE_RE.test(qEnd) &&
        qStart <= qEnd;

    const endDay = hasRange ? qEnd : today;
    const startDay = hasRange ? qStart : shiftDayKey(endDay, -(WINDOW_DAYS - 1));

    const [shows, setShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showCalendar, setShowCalendar] = useState(false);

    useEffect(() => {
        if (!router.isReady) return;
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const rows = await getShowsInRange(startDay, endDay);
                if (!cancelled) setShows(rows);
            } catch (err) {
                if (!cancelled) setError(err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [router.isReady, startDay, endDay]);

    const goToWindow = (start, end) => {
        setShowCalendar(false);
        router.push({ pathname: "/previous-shows/", query: { start, end } });
    };

    const span = dayKeySpan(startDay, endDay);

    const goOlder = () => {
        const newEnd = shiftDayKey(startDay, -1);
        const newStart = shiftDayKey(newEnd, -(span - 1));
        goToWindow(newStart, newEnd);
    };

    const goNewer = () => {
        let newStart = shiftDayKey(endDay, 1);
        let newEnd = shiftDayKey(newStart, span - 1);
        if (newEnd > today) {
            newEnd = today;
            newStart = shiftDayKey(newEnd, -(span - 1));
        }
        goToWindow(newStart, newEnd);
    };

    const atToday = endDay >= today;
    const days = groupByDay(shows);

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <h1 className="text-4xl font-light leading-tight">Previous Shows</h1>
                <p className="text-base text-gray-300 mt-1">
                    <Link href="/listen/" legacyBehavior={false} className="underline hover:no-underline">
                        ← Back to Listen
                    </Link>
                </p>
            </div>

            <div className="mx-auto w-full max-w-2xl px-4">
                {/* Window controls: step through the archive or open the calendar */}
                <div className="mb-4 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={goOlder}
                        className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                        ← Older
                    </button>
                    <div className="text-center">
                        <p className="font-courierprime text-sm text-[#e0ff05]">
                            {windowLabel(startDay, endDay)}
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowCalendar((v) => !v)}
                            className="mt-1 text-xs text-zinc-400 underline hover:no-underline"
                        >
                            {showCalendar ? "Hide calendar" : "Jump to a date"}
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={goNewer}
                        disabled={atToday}
                        className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-300"
                    >
                        Newer →
                    </button>
                </div>

                {showCalendar && (
                    <div className="mb-6">
                        <PreviousShowsCalendar
                            initialStart={startDay}
                            initialEnd={endDay}
                            maxDay={today}
                            onApply={goToWindow}
                        />
                    </div>
                )}

                {loading ? (
                    <p className="text-center text-zinc-400">Loading shows…</p>
                ) : error ? (
                    <p className="text-center text-zinc-400">Couldn&apos;t load shows.</p>
                ) : days.length === 0 ? (
                    <p className="text-center text-zinc-400">No shows in this date range.</p>
                ) : (
                    days.map((day) => (
                        <section key={day.key} className="mb-6">
                            <h2 className="mb-2 text-lg text-[#e0ff05]">{dayKeyLabel(day.key)}</h2>
                            <ul className="border border-zinc-800">
                                {day.shows.map((show) => (
                                    <li
                                        key={show.ID}
                                        className="border-b border-zinc-800 last:border-b-0"
                                    >
                                        <Link
                                            href={`/show/?id=${show.ID}`}
                                            legacyBehavior={false}
                                            className="flex flex-col gap-1 px-4 py-3 hover:bg-zinc-900 sm:flex-row sm:items-baseline sm:gap-4"
                                        >
                                            <span className="w-20 flex-shrink-0 text-sm text-zinc-400">
                                                {showTime(show.starttime)}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="font-courierprime text-white">
                                                    {show.title || "Untitled show"}
                                                </span>
                                                {show.defdjname || show.djname ? (
                                                    <span className="block text-sm text-zinc-400">
                                                        {show.defdjname || show.djname}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </div>
        </div>
    );
}
