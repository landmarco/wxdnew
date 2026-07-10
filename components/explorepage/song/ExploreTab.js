// This component contains the explore tab for finding new music.

import ExploreSong from './ExploreSong';
import { useState } from 'react';
import { useMostPlayed } from "@/hooks/useMostPlayed"

// values that are allowed as range.
const ALLOWED_RANGES = [1, 7, 30, 365];

// getting the value that is the closest to an element in ALLOWED_RANGES
function getClosestRange(value) {
  return ALLOWED_RANGES.reduce((closest, current) =>
    Math.abs(current - value) < Math.abs(closest - value)
      ? current
      : closest
  );
}

export default function ExploreTab() {

    const [range, setRange] = useState(7);

    // handling range change to ensure that range is always withing allowed values.
    const handleRangeChange = (e) => {
        const value = Number(e.target.value);
        setRange(getClosestRange(value));
    };
    
    // setting up the start and end dates. End date is today's date.
    const date = new Date();
    date.setDate(date.getDate() - range);
    const dateStart = date.toISOString().split('T')[0];

    const dateEnd = new Date().toISOString().split('T')[0];


    // Getting the most played songs
    const { mostplayed, loading, error } = useMostPlayed({dateStart: dateStart, dateEnd: dateEnd, limit:12});
    
    return (
        <div className="">
            <div >

            </div>
            <div className="flex flex-col items-center gap-3 mb-4">
                <h4 className="text-2xl font-light text-white text-center mt-8">
                    Most Played Songs in the
                </h4>
                <label htmlFor="rangeSelect" className="text-white sr-only">Range</label>
                <select
                    id="rangeSelect"
                    value={range}
                    onChange={handleRangeChange}
                    className="bg-black text-white border border-gray-600 rounded px-2 py-1"
                    aria-label="Select range in days"
                >
                    <option value={1}>Last 1 day</option>
                    <option value={7}>Last 7 days</option>
                    <option value={30}>Last 30 days</option>
                    <option value={365}>Last year</option>
                </select>
            </div>
            {loading ? (
                <p className="text-zinc-400 text-center">Loading...</p>
            ) : mostplayed.length === 0 ? (
                <p className="text-zinc-400">Most played songs not found.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 justify-items-center">
                    {mostplayed.map((item, i) => (
                        <ExploreSong key={i} rank={i+1} info={item} />
                    ))}
                </div>
            )
            }
        </div>
    );
}