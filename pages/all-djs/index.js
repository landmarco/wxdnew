// Full DJ directory. Lists every active DJ, then every specialty show, each
// linking to its show-list page (/dj/?id=<userID>). Client-fetched for the
// static export. Linked from /schedule.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllDjs, specialtyLabel } from "@/lib/allDjs";

export default function AllDjsPage() {
    const [djs, setDjs] = useState([]);
    const [specialtyShows, setSpecialtyShows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const { djs: djRows, specialtyShows: spRows } = await getAllDjs();
                if (!cancelled) {
                    setDjs(djRows);
                    setSpecialtyShows(spRows);
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
    }, []);

    if (loading) {
        return <Message>Loading DJs…</Message>;
    }
    if (error) {
        return <Message>Couldn&apos;t load the DJ list.</Message>;
    }

    return (
        <div id="main-content" className="min-h-screen text-white pb-8">
            <div className="text-center py-6">
                <h1 className="text-4xl font-light leading-tight">All DJs</h1>
            </div>

            <div className="mx-auto w-full max-w-2xl px-4 space-y-12">
                <DjSection
                    title="DJs"
                    rows={djs}
                    getLabel={(dj) => dj.defdjname}
                    emptyText="No DJs found."
                />
                <DjSection
                    title="Specialty Shows"
                    rows={specialtyShows}
                    getLabel={specialtyLabel}
                    emptyText="No specialty shows found."
                />
            </div>
        </div>
    );
}

function DjSection({ title, rows, getLabel, emptyText }) {
    return (
        <section>
            <h2 className="mb-3 text-2xl font-light">{title}</h2>
            {rows.length === 0 ? (
                <p className="text-zinc-400">{emptyText}</p>
            ) : (
                <ul className="overflow-hidden rounded-lg border border-zinc-800 bg-black/80">
                    {rows.map((dj) => (
                        <li key={dj.ID} className="border-b border-zinc-800 last:border-b-0">
                            <Link
                                href={`/dj/?id=${dj.ID}`}
                                legacyBehavior={false}
                                className="block px-4 py-3 hover:bg-zinc-900"
                            >
                                <span className="font-courierprime text-white">
                                    {getLabel(dj)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
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
