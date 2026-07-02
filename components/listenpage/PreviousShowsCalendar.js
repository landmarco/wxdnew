// Calendar widget for the Previous Shows page. Lets a visitor pick a single day
// or a day range and jump to the shows from that window. Purely client-side;
// "YYYY-MM-DD" day keys compare correctly as plain strings.

import { useState } from "react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const pad = (n) => String(n).padStart(2, "0");
const makeKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;

export default function PreviousShowsCalendar({ initialStart, initialEnd, maxDay, onApply }) {
    // Seed the visible month from the current selection (or today).
    const seed = initialEnd || maxDay;
    const [seedYear, seedMonth] = seed.split("-").map(Number);

    const [viewYear, setViewYear] = useState(seedYear);
    const [viewMonth, setViewMonth] = useState(seedMonth - 1); // 0-indexed
    const [pendingStart, setPendingStart] = useState(initialStart || null);
    const [pendingEnd, setPendingEnd] = useState(
        initialEnd && initialEnd !== initialStart ? initialEnd : null
    );

    const [maxYear, maxMonth] = maxDay.split("-").map(Number);
    // Don't let people page into months that are entirely in the future.
    const atMaxMonth = viewYear === maxYear && viewMonth === maxMonth - 1;

    const goPrevMonth = () => {
        const d = new Date(viewYear, viewMonth - 1, 1);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
    };
    const goNextMonth = () => {
        if (atMaxMonth) return;
        const d = new Date(viewYear, viewMonth + 1, 1);
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
    };

    const handleDayClick = (dayKey) => {
        // No selection yet, or a completed range — start a fresh selection.
        if (!pendingStart || pendingEnd) {
            setPendingStart(dayKey);
            setPendingEnd(null);
            return;
        }
        // Second click completes the range (ordered so start <= end).
        if (dayKey < pendingStart) {
            setPendingEnd(pendingStart);
            setPendingStart(dayKey);
        } else if (dayKey > pendingStart) {
            setPendingEnd(dayKey);
        } else {
            // clicked the same day again — keep it a single-day selection
            setPendingEnd(null);
        }
    };

    const isSelected = (dayKey) => {
        if (!pendingStart) return false;
        if (pendingEnd) return dayKey >= pendingStart && dayKey <= pendingEnd;
        return dayKey === pendingStart;
    };
    const isEndpoint = (dayKey) =>
        dayKey === pendingStart || dayKey === pendingEnd;

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

    const selectionLabel = pendingStart
        ? pendingEnd
            ? `${pendingStart} → ${pendingEnd}`
            : pendingStart
        : "Pick a day (click a second for a range)";

    return (
        <div className="mx-auto w-full max-w-xs rounded border border-zinc-800 bg-zinc-900/40 p-4 text-white">
            <div className="mb-3 flex items-center justify-between">
                <button
                    type="button"
                    onClick={goPrevMonth}
                    aria-label="Previous month"
                    className="px-2 py-1 text-lg text-zinc-400 hover:text-white"
                >
                    ‹
                </button>
                <span className="font-courierprime text-sm text-[#e0ff05]">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onClick={goNextMonth}
                    disabled={atMaxMonth}
                    aria-label="Next month"
                    className="px-2 py-1 text-lg text-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-zinc-400"
                >
                    ›
                </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-xs text-zinc-500">
                {WEEKDAYS.map((w, i) => (
                    <span key={i}>{w}</span>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-sm">
                {cells.map((day, i) => {
                    if (day === null) return <span key={`b${i}`} />;
                    const dayKey = makeKey(viewYear, viewMonth, day);
                    const disabled = dayKey > maxDay;
                    const selected = isSelected(dayKey);
                    const endpoint = isEndpoint(dayKey);
                    return (
                        <button
                            key={dayKey}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleDayClick(dayKey)}
                            className={[
                                "aspect-square rounded transition-colors",
                                disabled
                                    ? "cursor-not-allowed text-zinc-700"
                                    : "hover:bg-zinc-700",
                                endpoint
                                    ? "bg-[#e0ff05] font-semibold text-black hover:bg-[#e0ff05]"
                                    : selected
                                    ? "bg-[#e0ff05]/25 text-white"
                                    : "text-zinc-200",
                            ].join(" ")}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>

            <p className="mt-3 truncate text-center text-xs text-zinc-400">
                {selectionLabel}
            </p>

            <button
                type="button"
                onClick={() => onApply(pendingStart, pendingEnd || pendingStart)}
                disabled={!pendingStart}
                className="mt-3 w-full rounded border border-emerald-500/60 px-3 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
                View these shows
            </button>
        </div>
    );
}
