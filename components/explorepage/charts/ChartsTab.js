import ChartEntryRow from '@/components/explorepage/charts/ChartEntryRow';
import { useState } from 'react';
import { useMostPlayed } from "@/hooks/useMostPlayed"

const today = new Date().toISOString().split('T')[0];

//initalChart and latestDate come from getServerSideProps below
export default function ChartsTab() {

    const [selectedDate, setSelectedDate] = useState(today); //date the user has picked

    const date = new Date(selectedDate)
    date.setDate(date.getDate() - 7);
    const dateStart = date.toISOString().split('T')[0];

    // Getting the most played albums
    const { mostplayed, loading, error } = useMostPlayed({dateStart: dateStart, dateEnd: selectedDate, limit:10, isChart: true});

    return (
        <div className="min-h-screen text-white px-4 py-8 max-w-3xl mx-auto">
            <h1 className="font-courierprime text-3xl font-bold mb-6">WXDU TOP 10</h1>
            <p className="font-courierprime text-sm text-zinc-400 mb-6">Most spun new-add albums: Past 7 days</p>


            {/* date picker: user selects the date and the API returns the prior 7 days */}
            <div className="mb-6">
                <label
                    htmlFor="week-ending"
                    className="font-courierprime text-sm text-zinc-400 block mb-2"
                >
                    Week ending:
                </label>

                <input
                    id="week-ending"
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="font-courierprime bg-zinc-900 border border-zinc-600 text-white rounded px-3 py-2"
                />
            </div>

            {loading ? (
                <p className="text-zinc-400">Loading...</p>
            ) : mostplayed.length === 0 ? (
                <p className="text-zinc-400">No chart data available</p>
            ) : (
                <div>
                    {mostplayed.map(entry => (
                        <ChartEntryRow
                            key={entry.rank}
                            rank={entry.rank}
                            spins={entry.spins}
                            artist={entry.artist}
                            album={entry.album}
                            label={entry.label}
                            cover={entry.cover}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
