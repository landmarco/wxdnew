import ChartEntryRow from '../../components/charts/ChartEntryRow';
import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
    const [y, m, d] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export default function ChartsPage() {
    const [chart, setChart] = useState([]);
    const [selectedDate, setSelectedDate] = useState(formatLocalDate(new Date()));
    const [loading, setLoading] = useState(true);

    // fetch chart for the selected week-ending date
    useEffect(() => {
        if (!selectedDate) return;
        async function loadChart() {
            try {
                setLoading(true);
                const dateStart = addDays(selectedDate, -7);
                const rows = await apiFetch(
                    `/api/charts/mostplayed?isChart=true&limit=10&dateStart=${encodeURIComponent(dateStart)}&dateEnd=${encodeURIComponent(selectedDate)}`
                );
                const normalized = (Array.isArray(rows) ? rows : []).map((row, index) => ({
                    rank: index + 1,
                    spins: row.spins || 0,
                    artist: row.artist || '',
                    album: row.album || '',
                    label: row.label || '',
                }));
                setChart(normalized);
            } catch {
                setChart([]);
            } finally {
                setLoading(false);
            }
        }

        loadChart();
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
