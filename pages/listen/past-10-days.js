// "Past 10 days" page (the last10.php analog).
// URL: /listen/past-10-days — client-fetched list of recent shows grouped by
// day, each linking to its show playlist.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecentShows } from "@/lib/recentShows";
import { showTime, showDayKey } from "@/lib/showFormat";

// pretty label for a YYYY-MM-DD day key
function dayLabel(dayKey) {
    const [year, month, day] = dayKey.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
    });
}

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

export default function PastTenDays() {
    const [shows, setShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const rows = await getRecentShows(10);
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
    }, []);

    const days = groupByDay(shows);

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <h1 className="text-4xl font-light leading-tight">Past 10 Days</h1>
                <p className="text-base text-gray-300 mt-1">
                    <Link href="/listen/" legacyBehavior={false} className="underline hover:no-underline">
                        ← Back to Listen
                    </Link>
                </p>
            </div>

            <div className="mx-auto w-full max-w-2xl px-4">
                {loading ? (
                    <p className="text-center text-zinc-400">Loading shows…</p>
                ) : error ? (
                    <p className="text-center text-zinc-400">Couldn&apos;t load recent shows.</p>
                ) : days.length === 0 ? (
                    <p className="text-center text-zinc-400">No shows in the past 10 days.</p>
                ) : (
                    days.map((day) => (
                        <section key={day.key} className="mb-6">
                            <h2 className="mb-2 text-lg text-[#e0ff05]">{dayLabel(day.key)}</h2>
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
