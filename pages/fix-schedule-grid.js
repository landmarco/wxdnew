// Admin tool: /fix-schedule-grid
//
// Loads the built schedule grid, flags every show that didn't resolve to a DJ id
// (specialty [SP] shows, custom [X] names, and names that didn't match a DJ),
// and lets you search the DJ list to pin the right id to each one. When you're
// done it exports a corrected schedule.csv where every non-empty cell carries a
// "| <id>" pin, ready to replace public/uploads/schedule.csv.

import { useEffect, useMemo, useRef, useState } from "react"
import Fuse from "fuse.js"
import { parseSchedule } from "@/lib/schedule/scheduleParser"
import { scheduleBuilder } from "@/lib/schedule/scheduleBuilder"
import { apiFetch } from "@/lib/api"
import { fixEncodingDeep } from "@/lib/fixEncoding"

// Same pin syntax the pipeline understands: a trailing " | <id>" (or a
// comma-separated list "| 665,223" for a multi-DJ show).
function splitPinnedId(cell) {
	const raw = String(cell ?? "")
	const match = raw.match(/^(.*)\|\s*(\d+(?:\s*,\s*\d+)*)\s*$/)
	if (!match) return { base: raw.trim(), pinnedId: null }
	const ids = match[2].split(",").map((s) => s.trim()).filter(Boolean).join(",")
	return { base: match[1].trim(), pinnedId: ids }
}

// positive-integer ids parsed from a cell value (single "500" or list "665,223")
function parseIds(value) {
	return String(value ?? "")
		.split(",")
		.map((part) => parseInt(part.trim(), 10))
		.filter((n) => Number.isInteger(n) && n > 0)
}

function isResolvedId(value) {
	return parseIds(value).length > 0
}

// Best guess at the DJ name to search from a show's raw cell text:
//   "[SP] Bull City Cosmic Hoedown w/ Washboard Dave" -> "Washboard Dave"
//   "Barrett, Dominique"                              -> "Dominique Barrett"
//   "[X] Uncle Randy and Cousin Zoë"                  -> "Uncle Randy and Cousin Zoë"
function suggestionQuery(rawText) {
	let s = String(rawText ?? "")
		.replace(/^\[(?:X|SP)\]\s*/, "")
		.replace(/\s*\|\s*\d+\s*$/, "")
		.trim()

	// "... w/ Host" or "... with Host" -> the host after the last separator
	const parts = s.split(/\s+(?:w\/|with)\s+/i)
	if (parts.length > 1) {
		return parts[parts.length - 1].trim()
	}

	// "Last, First" -> "First Last" so it lines up with on-air names
	if (s.includes(",")) {
		const [last, ...rest] = s.split(",")
		const first = rest.join(",").trim()
		if (first && last.trim()) return `${first} ${last.trim()}`
	}

	return s
}

// RFC-4180-ish CSV serialization: quote cells containing comma/quote/newline.
function toCsv(grid) {
	return grid
		.map((row) =>
			row
				.map((cell) => {
					const s = String(cell ?? "")
					return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
				})
				.join(",")
		)
		.join("\r\n")
}

// Search box + filtered DJ option list for picking one DJ. Arrow keys move the
// highlight through the list and Enter selects the highlighted DJ.
function DjPicker({ djs, onSelect }) {
	const [query, setQuery] = useState("")
	const [activeIndex, setActiveIndex] = useState(0)
	const activeItemRef = useRef(null)

	const matches = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return []
		return djs
			.filter((dj) => dj.label.toLowerCase().includes(q) || String(dj.ID).includes(q))
			.slice(0, 12)
	}, [query, djs])

	// reset the highlight whenever the result set changes
	useEffect(() => {
		setActiveIndex(0)
	}, [query])

	// keep the highlighted option scrolled into view
	useEffect(() => {
		activeItemRef.current?.scrollIntoView({ block: "nearest" })
	}, [activeIndex])

	const choose = (dj) => {
		onSelect(dj)
		setQuery("")
	}

	const onKeyDown = (e) => {
		if (!matches.length) return
		if (e.key === "ArrowDown") {
			e.preventDefault()
			setActiveIndex((i) => Math.min(i + 1, matches.length - 1))
		} else if (e.key === "ArrowUp") {
			e.preventDefault()
			setActiveIndex((i) => Math.max(i - 1, 0))
		} else if (e.key === "Enter") {
			e.preventDefault()
			const dj = matches[activeIndex]
			if (dj) choose(dj)
		}
	}

	return (
		<div className="mt-2">
			<input
				type="text"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder="Search DJ names… (↑↓ to move, Enter to pick)"
				className="w-full rounded border border-zinc-600 bg-black px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-[#e0ff05] focus:outline-none"
			/>
			{matches.length > 0 && (
				<ul className="mt-1 max-h-52 overflow-auto rounded border border-zinc-700">
					{matches.map((dj, i) => (
						<li key={dj.ID} ref={i === activeIndex ? activeItemRef : null}>
							<button
								type="button"
								onClick={() => choose(dj)}
								onMouseEnter={() => setActiveIndex(i)}
								className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
									i === activeIndex ? "bg-zinc-800" : ""
								}`}
							>
								<span>{dj.label}</span>
								<span className="shrink-0 font-mono text-xs text-zinc-400">#{dj.ID}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

// Removable chips for the DJ(s) assigned to a show.
function AssignedChips({ list, onRemove }) {
	if (!list.length) return null
	return (
		<div className="mb-2 flex flex-wrap gap-2">
			{list.map((dj) => (
				<span
					key={dj.ID}
					className="inline-flex items-center gap-1 rounded bg-emerald-600/20 px-2 py-1 text-xs text-emerald-200"
				>
					{dj.label} #{dj.ID}
					<button
						type="button"
						onClick={() => onRemove(dj.ID)}
						aria-label={`Remove ${dj.label}`}
						className="leading-none text-emerald-300/80 hover:text-white"
					>
						×
					</button>
				</span>
			))}
		</div>
	)
}

export default function FixScheduleGrid({ headerRow, hourColumn, rawGrid, idGrid, displayGrid, error }) {
	const [djs, setDjs] = useState([])
	const [djStatus, setDjStatus] = useState("loading") // loading | ready | error
	// rawText -> chosen DJ { ID, defdjname, label } (fills unresolved + overrides existing)
	const [assignments, setAssignments] = useState({})
	// "Reassign any show" module state
	const [reassignFilter, setReassignFilter] = useState("")
	const [openText, setOpenText] = useState(null)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			try {
				const rows = await apiFetch("/api/djs")
				const list = fixEncodingDeep(Array.isArray(rows) ? rows : [])
					.filter((dj) => dj && dj.ID != null)
					.map((dj) => {
						const name = String(dj.defdjname || "").trim()
						return { ID: Number(dj.ID), defdjname: name, label: name || `DJ #${Number(dj.ID)}` }
					})
					.sort((a, b) => a.label.localeCompare(b.label))
				if (!cancelled) {
					setDjs(list)
					setDjStatus("ready")
				}
			} catch {
				if (!cancelled) setDjStatus("error")
			}
		})()
		return () => {
			cancelled = true
		}
	}, [])

	// Unique unresolved shows (non-empty cell whose id didn't resolve), grouped by
	// raw cell text so a show that recurs is only resolved once.
	const unresolved = useMemo(() => {
		const byText = new Map()
		rawGrid.forEach((row, r) => {
			row.forEach((cell, c) => {
				const text = String(cell ?? "").trim()
				if (!text) return
				if (isResolvedId(idGrid?.[r]?.[c])) return
				if (!byText.has(text)) {
					byText.set(text, {
						text,
						display: String(displayGrid?.[r]?.[c] ?? "").trim() || text,
						count: 0,
					})
				}
				byText.get(text).count += 1
			})
		})
		return Array.from(byText.values()).sort((a, b) => a.display.localeCompare(b.display))
	}, [rawGrid, idGrid, displayGrid])

	// Fuzzy index over on-air names, used to suggest the most likely DJ per show.
	const fuse = useMemo(() => {
		const named = djs.filter((dj) => dj.defdjname)
		return new Fuse(named, { keys: ["defdjname"], threshold: 0.4, ignoreLocation: true })
	}, [djs])

	// text -> best-guess DJ (from the host name in the show title)
	const suggestions = useMemo(() => {
		const map = {}
		if (!djs.length) return map
		for (const item of unresolved) {
			const query = suggestionQuery(item.text)
			if (!query) continue
			const hit = fuse.search(query, { limit: 1 })[0]
			if (hit) map[item.text] = hit.item
		}
		return map
	}, [unresolved, fuse, djs])

	// assignments[text] is an array of DJs — a show can have several. Adding is
	// idempotent per DJ id; a show is "assigned" once it has at least one.
	const assign = (text, dj) =>
		setAssignments((prev) => {
			const current = prev[text] || []
			if (current.some((d) => d.ID === dj.ID)) return prev
			return { ...prev, [text]: [...current, dj] }
		})
	const removeDj = (text, id) =>
		setAssignments((prev) => {
			const current = (prev[text] || []).filter((d) => d.ID !== id)
			const next = { ...prev }
			if (current.length) next[text] = current
			else delete next[text]
			return next
		})
	const clearAssignment = (text) =>
		setAssignments((prev) => {
			const next = { ...prev }
			delete next[text]
			return next
		})

	const resolvedCount = unresolved.filter((item) => (assignments[item.text] || []).length).length
	const allResolved = unresolved.length > 0 && resolvedCount === unresolved.length

	// Every non-empty slot (grouped by cell text), with its current resolved id —
	// backs the "Reassign any show" module so already-correct slots can be changed.
	const allSlots = useMemo(() => {
		const byText = new Map()
		rawGrid.forEach((row, r) => {
			row.forEach((cell, c) => {
				const text = String(cell ?? "").trim()
				if (!text) return
				if (!byText.has(text)) {
					byText.set(text, {
						text,
						display: String(displayGrid?.[r]?.[c] ?? "").trim() || text,
						currentIds: parseIds(idGrid?.[r]?.[c]),
						count: 0,
					})
				}
				byText.get(text).count += 1
			})
		})
		return Array.from(byText.values()).sort((a, b) => a.display.localeCompare(b.display))
	}, [rawGrid, idGrid, displayGrid])

	const filteredSlots = useMemo(() => {
		const q = reassignFilter.trim().toLowerCase()
		if (!q) return allSlots
		return allSlots.filter(
			(s) => s.display.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)
		)
	}, [allSlots, reassignFilter])

	// Resolve the DJ id(s) for a cell as a comma-separated string: a user
	// assignment/override always wins, else the existing resolved id(s). This lets
	// a reassignment override an already-correct slot, including with multiple DJs.
	const cellId = (rawText, r, c) => {
		const assigned = assignments[rawText]
		if (assigned && assigned.length) return assigned.map((d) => d.ID).join(",")
		const ids = parseIds(idGrid?.[r]?.[c])
		return ids.length ? ids.join(",") : null
	}

	const downloadCsv = () => {
		// pin every non-empty cell's id; leave empty cells and still-unresolved cells as-is
		const body = rawGrid.map((row, r) => {
			const cells = row.map((cell, c) => {
				const text = String(cell ?? "").trim()
				if (!text) return ""
				const { base } = splitPinnedId(text)
				const id = cellId(text, r, c)
				return id != null ? `${base} | ${id}` : base
			})
			return [hourColumn[r] ?? "", ...cells]
		})
		const csv = toCsv([headerRow, ...body])

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
		const url = URL.createObjectURL(blob)
		const a = document.createElement("a")
		a.href = url
		a.download = "schedule.csv"
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}

	return (
		<div className="min-h-screen px-4 py-8 text-white">
			<div className="mx-auto w-full max-w-3xl">
				<h1 className="text-3xl font-light">Fix Schedule Grid</h1>
				<p className="mt-2 text-sm text-zinc-400">
					Every show below didn&apos;t resolve to a DJ id (specialty shows, custom
					names, or names that didn&apos;t match a DJ). Search the DJ list to pin the
					right one, then download the corrected <code>schedule.csv</code> and upload
					it to replace <code>public/uploads/schedule.csv</code>.
				</p>

				<details className="mt-4 rounded border border-zinc-700 bg-zinc-900/40 p-3 text-sm text-zinc-300">
					<summary className="cursor-pointer font-semibold text-[#e0ff05]">How to apply this</summary>
					<ol className="mt-2 list-decimal space-y-1 pl-5">
						<li>Fix / reassign the shows below, then click <strong>Download schedule.csv</strong>.</li>
						<li>
							Go to <code>/admin</code> → <strong>Media Manager</strong> → the <code>uploads</code> folder
							and upload the file, replacing the existing one. Keep the exact name{" "}
							<code>schedule.csv</code> (delete the old one first if it won&apos;t overwrite).
						</li>
						<li>
							Redeploy / rebuild the site — the schedule is parsed at <em>build time</em>, so the
							changes appear after the next deploy. Then reload this page to confirm everything resolves.
						</li>
					</ol>
					<p className="mt-2 text-xs text-zinc-400">
						Tip: for a show with several DJs, add each of them — the pin becomes{" "}
						<code>| 665,223,489</code> and the show links to all of their shows.
					</p>
				</details>

				{error ? (
					<p className="mt-6 rounded border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-300">
						Couldn&apos;t load the schedule: {error}
					</p>
				) : (
					<>
						{djStatus === "loading" && (
							<p className="mt-4 text-sm text-zinc-400">Loading DJ list…</p>
						)}
						{djStatus === "error" && (
							<p className="mt-4 text-sm text-red-300">
								Couldn&apos;t load the DJ list from the API — pinning is unavailable right now.
							</p>
						)}

						<div className="sticky top-0 z-10 mt-6 flex items-center justify-between gap-4 border-b border-zinc-700 bg-black/90 py-3 backdrop-blur">
							<span className="text-sm text-zinc-300">
								{unresolved.length === 0 ? (
									"All shows already resolve to a DJ id ✓"
								) : (
									<>
										<span className="font-bold text-[#e0ff05]">{resolvedCount}</span> of{" "}
										<span className="font-bold">{unresolved.length}</span> shows pinned
									</>
								)}
							</span>
							<button
								type="button"
								onClick={downloadCsv}
								disabled={djStatus !== "ready"}
								className={`rounded border px-4 py-2 text-sm transition-colors ${
									allResolved || unresolved.length === 0
										? "border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10"
										: "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
								} disabled:cursor-not-allowed disabled:opacity-40`}
								title={
									allResolved || unresolved.length === 0
										? "Download corrected schedule.csv"
										: "You can download now, but some shows are still unpinned"
								}
							>
								Download schedule.csv
							</button>
						</div>

						{unresolved.length === 0 ? (
							<p className="mt-6 text-sm text-zinc-400">
								Nothing to fix. You can still download to pin every cell&apos;s id.
							</p>
						) : (
							<ul className="mt-4 space-y-3">
								{unresolved.map((item) => {
									const assignedList = assignments[item.text] || []
									return (
										<li
											key={item.text}
											className={`rounded border p-4 ${
												assignedList.length ? "border-emerald-600/50 bg-emerald-500/5" : "border-zinc-700"
											}`}
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<p className="break-words font-courierprime text-[#e0ff05]">{item.display}</p>
													<p className="mt-0.5 break-words font-mono text-xs text-zinc-400">
														{item.text}
														{item.count > 1 ? `  ·  ${item.count} slots` : ""}
													</p>
												</div>
												{assignedList.length > 0 && (
													<button
														type="button"
														onClick={() => clearAssignment(item.text)}
														className="shrink-0 text-xs text-zinc-400 underline hover:no-underline"
													>
														clear
													</button>
												)}
											</div>

											{djStatus === "ready" && (
												<div className="mt-2">
													<AssignedChips
														list={assignedList}
														onRemove={(id) => removeDj(item.text, id)}
													/>
													{assignedList.length === 0 && suggestions[item.text] && (
														<div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
															<span className="text-zinc-400">Suggested:</span>
															<button
																type="button"
																onClick={() => assign(item.text, suggestions[item.text])}
																className="rounded border border-[#e0ff05]/50 px-2 py-1 text-[#e0ff05] transition-colors hover:bg-[#e0ff05]/10"
															>
																{suggestions[item.text].label} #{suggestions[item.text].ID}
															</button>
														</div>
													)}
													<DjPicker djs={djs} onSelect={(dj) => assign(item.text, dj)} />
													{assignedList.length > 0 && (
														<p className="mt-1 text-xs text-zinc-400">Add another DJ for a multi-DJ show.</p>
													)}
												</div>
											)}
										</li>
									)
								})}
							</ul>
						)}

						{/* Reassign any show — override even already-correct slots */}
						<section className="mt-12 border-t border-zinc-700 pt-6">
							<h2 className="text-2xl font-light">Reassign any show</h2>
							<p className="mt-1 text-sm text-zinc-400">
								Change the DJ for any slot — even ones that already resolved — to fix a
								wrong association. An override here takes priority in the downloaded CSV.
							</p>

							<input
								type="text"
								value={reassignFilter}
								onChange={(e) => setReassignFilter(e.target.value)}
								placeholder="Filter shows…"
								className="mt-3 w-full rounded border border-zinc-600 bg-black px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-[#e0ff05] focus:outline-none"
							/>

							<ul className="mt-3 space-y-2">
								{filteredSlots.map((slot) => {
									const override = assignments[slot.text] || []
									const isOpen = openText === slot.text
									return (
										<li
											key={slot.text}
											className={`rounded border p-3 ${
												override.length ? "border-emerald-600/50 bg-emerald-500/5" : "border-zinc-700"
											}`}
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<p className="break-words font-courierprime text-white">{slot.display}</p>
													<p className="mt-0.5 break-words font-mono text-xs text-zinc-400">
														{override.length
															? `now → ${override.map((d) => `#${d.ID}`).join(", ")}`
															: slot.currentIds.length
																? `currently ${slot.currentIds.map((id) => `#${id}`).join(", ")}`
																: "no DJ id"}
														{slot.count > 1 ? `  ·  ${slot.count} slots` : ""}
													</p>
												</div>
												<div className="flex shrink-0 items-center gap-2">
													{override.length > 0 && (
														<button
															type="button"
															onClick={() => clearAssignment(slot.text)}
															className="text-xs text-zinc-400 underline hover:no-underline"
														>
															reset
														</button>
													)}
													<button
														type="button"
														onClick={() => setOpenText(isOpen ? null : slot.text)}
														disabled={djStatus !== "ready"}
														className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
													>
														{isOpen ? "close" : "reassign"}
													</button>
												</div>
											</div>
											{isOpen && djStatus === "ready" && (
												<div className="mt-2">
													<AssignedChips
														list={override}
														onRemove={(id) => removeDj(slot.text, id)}
													/>
													<DjPicker djs={djs} onSelect={(dj) => assign(slot.text, dj)} />
													<p className="mt-1 text-xs text-zinc-400">
														Add multiple DJs for a shared show. &quot;reset&quot; restores the original.
													</p>
												</div>
											)}
										</li>
									)
								})}
							</ul>
						</section>
					</>
				)}
			</div>
		</div>
	)
}

export async function getStaticProps() {
	// deep-clone to strip any undefined so Next can serialize the props
	const clean = (v) => JSON.parse(JSON.stringify(v ?? null))

	let raw
	try {
		raw = parseSchedule()
	} catch (err) {
		return {
			props: {
				headerRow: [],
				hourColumn: [],
				rawGrid: [],
				idGrid: [],
				displayGrid: [],
				error: String(err?.message || err),
			},
		}
	}

	let built = null
	try {
		built = await scheduleBuilder()
	} catch {
		// leave built null — cells will just show as unresolved until the API is reachable
	}

	return {
		props: {
			headerRow: clean(raw[0] || []),
			hourColumn: clean(raw[1] || []),
			rawGrid: clean(raw[3] || []),
			idGrid: clean(built?.[4] || []),
			displayGrid: clean(built?.[3] || []),
			error: null,
		},
	}
}
