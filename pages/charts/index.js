import ChartEntryRow from '../../components/charts/ChartEntryRow';
import { useState, useEffect } from 'react';

export default function ChartsPage() {
    const [chart, setChart] = useState([]);
    const [latestDate, setLatestDate] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(true);

    // fetch the latest chart and date on mount
    useEffect(() => {
        fetch('/api/charts?isChart=true')
            .then(r => r.json())
            .then(data => {
                setChart(Array.isArray(data.chart) ? data.chart : []);
                setLatestDate(data.latestDate || '');
                setSelectedDate(data.latestDate || '');
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    //runs whenever selectedDate changes - fetches chart for the new date from the api
    useEffect(() => {
        if (!selectedDate || selectedDate === latestDate) return; //skip fetch on first load, we already have the data
        setLoading(true);
        fetch(`/api/charts/${selectedDate}`)
            .then(r => r.json())
            .then(data => { setChart(Array.isArray(data) ? data : []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [selectedDate]);

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
            ) : chart.length === 0 ? (
                <p className="text-zinc-400">No chart data available</p>
            ) : (
                <div>
                    {chart.map(entry => (
                        <ChartEntryRow
                            key={entry.rank}
                            rank={entry.rank}
                            spins={entry.spins}
                            artist={entry.artist}
                            album={entry.album}
                            label={entry.label}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
