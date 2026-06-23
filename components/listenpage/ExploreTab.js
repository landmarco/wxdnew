// This component contains the explore tab for finding new music.

import ExploreSong from './ExploreSong';
import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { getReleaseCoverUrl } from '../../lib/releaseCover';

function formatDateUTC(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDateRange(days) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(endDate.getUTCDate() - Number(days));
    return {
        dateStart: formatDateUTC(startDate),
        dateEnd: formatDateUTC(endDate),
    };
}

export default function ExploreTab() {
    const [loading, setLoading] = useState(false);
    const [songs, setSongs] = useState([]);
    const [range, setRange] = useState(7);

    // function to find the most played songs
    async function fetchSongs(range) {
        setLoading(true);

        try {
            const { dateStart, dateEnd } = getDateRange(range);
            const raw = await apiFetch(
                `/api/charts/mostplayed?limit=12&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(dateEnd)}`
            );
            const items = Array.isArray(raw) ? raw : [];
            const withCovers = await Promise.all(
                items.map(async (item, index) => ({
                    ...item,
                    rank: index + 1,
                    cover: (await getReleaseCoverUrl(item.artist, item.album)) || '/CD_1_Filler.jpg',
                }))
            );

            setSongs(withCovers);
        } catch (err) {
            console.error('fetchSongs error', err);
            setSongs([]);
        } finally {
            setLoading(false);
        }
    }

    // fetching songs each time the user changes the range
    useEffect(() => {
        const ac = new AbortController();
        // call fetchSongs and pass the controller's signal so the fetch can be aborted
        fetchSongs(range);
        return () => ac.abort(); // cancels in-flight requests on unmount or when `range` changes
    }, [range]);
    
    return (
        <div className="w-full">
            <h4 className="text-2xl font-light text-white text-center mb-4">Explore New Music</h4>
            <div className="flex items-center justify-center gap-3 mb-4">
                <label htmlFor="rangeSelect" className="text-white sr-only">Range</label>
                <select
                    id="rangeSelect"
                    value={range}
                    onChange={(e) => setRange(Number(e.target.value))}
                    className="bg-black text-white border border-gray-600 rounded px-2 py-1"
                    aria-label="Select range in days"
                >
                    <option value={1}>Last 1 day</option>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={365}>Last year</option>
                </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 justify-items-center">
                {songs.map((item, i) => (
                    <ExploreSong key={i} rank={item.rank} info={item} />
                ))}
            </div>
        </div>
    );
}
