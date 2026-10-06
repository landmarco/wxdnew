// Admin tool: /fix-schedule-grid
//
// An editable copy of the whole weekly schedule. Every hour of every day is a
// cell you can click to change: who's on, what the slot is called, whether it's
// a specialty show, and where clicking it on the site goes. Cells that don't
// link anywhere yet (unpinned specialty [SP] shows, custom [X] names, names that
// didn't match a DJ) are flagged so a new semester's sheet can be worked through
// one by one. When you're done it exports a corrected schedule.csv, ready to
// replace public/uploads/schedule.csv.
//
// The editor reads and writes cells with the same parser the build uses
// (lib/schedule/cellPin.js), and the preview mirrors what id-lookup.js /
// djName-lookup.js will do with the cell, so what you see here is what renders.
//
// Two things make the once-a-semester rebuild less painful:
//   - the picker searches real names as well as on-air names, because a new
//     semester sheet arrives as a grid of real names and /api/djs only exposes
//     on-air ones (see lookupByRealName)
//   - the export rewrites plain cells to the DJ's on-air name so real names stay
//     out of the committed CSV (see stripName), and flags the DJs who have no
//     on-air name to rewrite to

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Fuse from "fuse.js"
import { parseSchedule } from "@/lib/schedule/scheduleParser"
import { scheduleBuilder } from "@/lib/schedule/scheduleBuilder"
import { splitPinnedId } from "@/lib/schedule/cellPin"
import { formatHourRange } from "@/lib/schedule/labels"
import { scheduleCellHref, AUTO_DJ_ID } from "@/lib/djLink"
import { apiFetch } from "@/lib/api"
import { fixEncodingDeep } from "@/lib/fixEncoding"

// what an empty cell renders as (see djName-lookup.js)
const AUTO_DJ_NAME = "Lunokhod 3"

// unsaved grid edits survive a reload in this browser (see the draft effects)
const DRAFT_KEY = "wxdu:fix-schedule-grid:draft"

// positive-integer ids parsed from a cell value (single "500" or list "665,223")
function parseIds(value) {
	return String(value ?? "")
		.split(",")
		.map((part) => parseInt(part.trim(), 10))
		.filter((n) => Number.isInteger(n) && n > 0)
}

// The tags id-lookup.js recognises. It checks startsWith("[X] ") — the space is
// part of the tag, so "[X]Name" is NOT a custom name.
const TAGS = { custom: "[X]", specialty: "[SP]" }
const TAG_RE = /^\[(X|SP)\] /

// A cell broken into the pieces the editor form works with:
//   kind   "empty" | "dj" (plain) | "custom" ([X]) | "specialty" ([SP])
//   label  the text left of the pin, tag removed
//   ids    pinned DJ ids
//   terms  quoted search terms
function decomposeCell(text) {
	const raw = String(text ?? "").trim()
	if (!raw) return { kind: "empty", label: "", ids: [], terms: [] }

	const { base, pinnedId, searchTerms } = splitPinnedId(raw)
	const tag = base.match(TAG_RE)
	return {
		kind: tag ? (tag[1] === "X" ? "custom" : "specialty") : "dj",
		label: tag ? base.slice(tag[0].length).trim() : base,
		ids: parseIds(pinnedId),
		terms: searchTerms,
	}
}

// A search term goes in straight double quotes. The pin is everything after the
// LAST "|", so a term can't contain one; a stray double quote becomes an
// apostrophe so it can't be read as the term's closing quote.
function normalizeTerm(term) {
	return String(term ?? "")
		.replace(/\|/g, " ")
		.replace(/"/g, "'")
		.replace(/\s+/g, " ")
		.trim()
}

function quoteTerm(term) {
	const clean = normalizeTerm(term)
	return clean ? `"${clean}"` : ""
}

// The inverse of decomposeCell. `autoLabel` stands in for an empty label on a
// plain DJ cell (the pinned DJs' on-air names), since that text is only a hint.
function composeCell({ kind, label, ids, terms }, autoLabel = "") {
	if (kind === "empty") return ""

	const name = String(label ?? "").replace(/\s+/g, " ").trim()
	const base = kind === "dj" ? name || autoLabel : `${TAGS[kind]} ${name}`.trim()
	const pin = [...ids.map(String), ...terms.map(quoteTerm).filter(Boolean)]

	if (!pin.length) return base
	return base ? `${base} | ${pin.join(", ")}` : `| ${pin.join(", ")}`
}

// "Ratterree, Charlie" -> "Charlie R", the fallback djName-lookup.js renders for
// a pinned DJ with no on-air name. Only "Last, First" text produces one.
function lastFirstToFirstL(base) {
	const parts = String(base ?? "").split(",")
	const last = parts[0]?.trim()
	const first = parts.slice(1).join(",").trim()
	return first && last ? `${first} ${last[0]}` : null
}

// Everything the page needs to know about one cell, following the same rules
// as the build (id-lookup.js -> djName-lookup.js -> WeeklySchedule.js):
//   display    the text the schedule will show
//   href       where clicking it goes, or null for plain text
//   ids        DJ ids the cell resolves to
//   resolved   whether it links anywhere specific (DJ page or search)
//   warnings   things that will look wrong on the site
//
// `built` carries the build-time result for a cell that hasn't been edited, so
// plain "Last, First" cells (resolved by a name lookup at build) show the real
// outcome. An edited cell has no build result yet; those are predicted.
function describeCell(text, { djById, built } = {}) {
	const parsed = decomposeCell(text)
	const { kind, label, terms } = parsed
	const warnings = []

	if (kind === "empty") {
		return {
			...parsed,
			display: AUTO_DJ_NAME,
			href: scheduleCellHref(null, AUTO_DJ_ID),
			resolved: true,
			warnings,
		}
	}

	const { base, pinnedId } = splitPinnedId(text)
	let ids = parsed.ids
	let display

	if (kind !== "dj") {
		display = label
		if (!label) warnings.push(`A ${TAGS[kind]} cell needs a name after the tag — it would render blank.`)
	} else if (ids.length) {
		const nameFor = (id) => (id === AUTO_DJ_ID ? AUTO_DJ_NAME : djById?.get(id)?.defdjname || null)
		if (ids.length === 1) {
			display = nameFor(ids[0]) || lastFirstToFirstL(base) || `[NO DJ NAME FOUND] ${ids[0]}`
		} else {
			display = ids.map((id) => nameFor(id) || `#${id}`).join(" / ")
		}
		if (djById?.size) {
			const unnamed = ids.filter((id) => id !== AUTO_DJ_ID && !djById.get(id)?.defdjname)
			if (unnamed.length) {
				warnings.push(
					`${unnamed.map((id) => `#${id}`).join(", ")} ${unnamed.length === 1 ? "has" : "have"} no on-air name in plmanager. Use a custom name ([X]) to control what shows.`
				)
			}
		}
	} else if (built) {
		// plain text with no pin: the build looked it up by "Last, First"
		ids = parseIds(String(built.id ?? "").startsWith("[") ? "" : built.id)
		display = built.display || base
	} else {
		// edited plain text with no pin: the build will try a "Last, First" lookup
		if (lastFirstToFirstL(base)) {
			display = base
			warnings.push(`No DJ picked, so this slot may not show or link properly. Pick a DJ.`)
		} else {
			display = `[NAME PARSE ERROR] ${base}`
			warnings.push(`No DJ picked, so this renders as an error. Pick a DJ, or make it a custom name ([X]).`)
		}
	}

	// an untouched cell shows whatever the build actually produced
	if (built?.display) display = built.display

	const href = scheduleCellHref(terms.length ? { terms, djIds: pinnedId } : null, ids.length ? ids.join(",") : null)
	return { ...parsed, ids, display, href, resolved: Boolean(href), warnings }
}

// The rows of the show block around (r, c): neighbouring hours in the same day
// holding the exact same entry. An empty cell is a block of one.
function findBlock(cells, r, c) {
	const text = cells[r]?.[c] ?? ""
	let start = r
	let end = r
	if (text) {
		while (start > 0 && cells[start - 1][c] === text) start -= 1
		while (end < cells.length - 1 && cells[end + 1][c] === text) end += 1
	}
	return { start, end }
}

// Every cell run through describeCell. Cells still matching schedule.csv get
// their build-time result; edited ones are predicted.
function describeGrid(cells, original, idGrid, displayGrid, djById) {
	return cells.map((row, r) =>
		row.map((cell, c) =>
			describeCell(cell, {
				djById,
				built:
					cell === original[r][c]
						? { id: idGrid?.[r]?.[c] ?? null, display: String(displayGrid?.[r]?.[c] ?? "").trim() }
						: null,
			})
		)
	)
}

// Slots that don't link anywhere, one entry per show block, reading down each
// day in turn. These are what a new semester sheet needs worked through.
function unresolvedSlots(cells, info) {
	const list = []
	const width = cells[0]?.length ?? 0
	for (let c = 0; c < width; c += 1) {
		cells.forEach((row, r) => {
			if (!row[c] || info[r][c].resolved) return
			if (r > 0 && cells[r - 1][c] === row[c]) return // same block as the hour above
			list.push({ r, c })
		})
	}
	return list
}

// The first slot in `list` after `from` (wrapping around), or the first one.
function nextSlot(list, from) {
	if (!list.length) return null
	if (!from) return list[0]
	return list.find(({ r, c }) => c > from.c || (c === from.c && r > from.r)) || list[0]
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

// Condenses a name down to first name + last initial, the same shape the site
// already falls back to for DJs with no on-air name set:
//   "Tintera, Matthew" -> "Matthew T"      (schedule.csv "Last, First" form)
//   "Matty Tintera"    -> "Matty T"        (raw semester-sheet "First Last" form)
// Used when exporting a name-free CSV for a DJ who has no on-air name to use
// instead — it keeps the cell readable without carrying a full real name.
function firstNameLastInitial(rawText) {
	const s = String(rawText ?? "")
		.replace(/^\[(?:X|SP)\]\s*/, "")
		.replace(/\s*\|\s*\d+(?:\s*,\s*\d+)*\s*$/, "")
		.trim()
	if (!s) return ""

	if (s.includes(",")) {
		const [last, ...rest] = s.split(",")
		const first = rest.join(",").trim()
		if (first && last.trim()) return `${first} ${last.trim()[0]}`
	}

	const parts = s.split(/\s+/)
	if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}`
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

// Looks a DJ up by their real name through /api/djs?firstname=&lastname=.
// The plain /api/djs list only carries on-air names, so a search for the real
// name on a semester schedule sheet ("Matty Tintera") finds nothing locally —
// this is the only way to resolve one. Tries the full "First Last" split first,
// then falls back to the surname alone, which catches nicknames ("Matty" for
// "Matthew"). Returns [] rather than throwing so a failed lookup just shows
// no extra results.
async function lookupByRealName(query) {
	const s = String(query ?? "").trim()
	if (s.length < 2) return []

	const get = async (params) => {
		try {
			const qs = new URLSearchParams(params).toString()
			const rows = await apiFetch(`/api/djs?${qs}`)
			return Array.isArray(rows) ? rows : rows ? [rows] : []
		} catch {
			return []
		}
	}

	const parts = s.split(/\s+/)
	if (parts.length < 2) {
		// one word: it could be either half of the name
		const [byLast, byFirst] = await Promise.all([
			get({ lastname: s }),
			get({ firstname: s }),
		])
		return [...byLast, ...byFirst]
	}

	const first = parts[0]
	const last = parts.slice(1).join(" ")
	const full = await get({ firstname: first, lastname: last })
	if (full.length) return full

	// nickname or a middle name in the way: match on surname alone. Try the
	// whole tail first, then just the final word ("Rabbi Elana Friedman").
	const bySurname = await get({ lastname: last })
	if (bySurname.length) return bySurname
	return parts.length > 2 ? get({ lastname: parts[parts.length - 1] }) : []
}

// Search box + filtered DJ option list for picking one DJ. Arrow keys move the
// highlight through the list and Enter selects the highlighted DJ. Searches
// on-air names locally and real names through the API, since the two live in
// different places.
function DjPicker({ djs, onSelect }) {
	const [query, setQuery] = useState("")
	const [activeIndex, setActiveIndex] = useState(0)
	const [realNameHits, setRealNameHits] = useState([])
	const [realNameStatus, setRealNameStatus] = useState("idle") // idle | searching | done
	const activeItemRef = useRef(null)

	const localMatches = useMemo(() => {
		const q = query.trim().toLowerCase()
		if (!q) return []
		return djs
			.filter((dj) => dj.label.toLowerCase().includes(q) || String(dj.ID).includes(q))
			.slice(0, 12)
	}, [query, djs])

	// Debounced real-name lookup. Every result is tagged so the list can show
	// where it came from — an on-air-name match and a real-name match for the
	// same query are different kinds of evidence.
	useEffect(() => {
		const q = query.trim()
		if (q.length < 2) {
			setRealNameHits([])
			setRealNameStatus("idle")
			return
		}

		let cancelled = false
		setRealNameStatus("searching")
		const timer = setTimeout(async () => {
			const rows = await lookupByRealName(q)
			if (cancelled) return
			const seen = new Set()
			setRealNameHits(
				fixEncodingDeep(rows)
					.filter((dj) => dj && dj.ID != null)
					.map((dj) => {
						const name = String(dj.defdjname || "").trim()
						return { ID: Number(dj.ID), defdjname: name, label: name || `DJ #${Number(dj.ID)}` }
					})
					.filter((dj) => (seen.has(dj.ID) ? false : seen.add(dj.ID)))
			)
			setRealNameStatus("done")
		}, 250)

		return () => {
			cancelled = true
			clearTimeout(timer)
		}
	}, [query])

	// on-air-name matches first, then real-name matches the local list missed
	const matches = useMemo(() => {
		const localIds = new Set(localMatches.map((dj) => dj.ID))
		return [
			...localMatches.map((dj) => ({ ...dj, via: "on-air name" })),
			...realNameHits
				.filter((dj) => !localIds.has(dj.ID))
				.map((dj) => ({ ...dj, via: "real name" })),
		]
	}, [localMatches, realNameHits])

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
				placeholder="Search on-air or real name… (↑↓ to move, Enter to pick)"
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
								<span className="min-w-0">
									<span className={dj.defdjname ? "" : "text-amber-300"}>{dj.label}</span>
									{!dj.defdjname && (
										<span className="ml-2 text-xs text-amber-400/80">no on-air name</span>
									)}
								</span>
								<span className="flex shrink-0 items-center gap-2">
									<span className="text-xs text-zinc-500">{dj.via}</span>
									<span className="font-mono text-xs text-zinc-400">#{dj.ID}</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{query.trim().length >= 2 && realNameStatus === "searching" && matches.length === 0 && (
				<p className="mt-1 text-xs text-zinc-500">Searching real names…</p>
			)}
			{query.trim().length >= 2 && realNameStatus === "done" && matches.length === 0 && (
				<p className="mt-1 text-xs text-zinc-500">
					No match by on-air name or real name.
				</p>
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

// One row of the cell-format reference table.
function FormatRow({ entry, shows, links, children }) {
	return (
		<tr className="border-t border-zinc-800 align-top">
			<td className="py-2 pr-3 font-mono text-xs text-[#e0ff05]">{entry}</td>
			<td className="py-2 pr-3 text-xs text-zinc-200">{shows}</td>
			<td className="py-2 pr-3 font-mono text-xs text-zinc-400">{links}</td>
			<td className="py-2 text-xs text-zinc-400">{children}</td>
		</tr>
	)
}

// How schedule.csv is read, cell by cell. Written for whoever edits the CSV
// directly (in a spreadsheet) as much as for users of the grid below.
function CellFormatGuide() {
	return (
		<details className="mt-4 rounded border border-zinc-700 bg-zinc-900/40 p-3 text-sm text-zinc-300">
			<summary className="cursor-pointer font-semibold text-[#e0ff05]">
				How schedule.csv entries are read
			</summary>

			<div className="mt-3 space-y-3 text-xs text-zinc-300">
				<p>
					<strong>Layout.</strong> The first row is the corner cell (the semester tag, e.g.{" "}
					<code>fall26</code>, shown above the hour column as &ldquo;fall 2026&rdquo;) followed by
					the day names. Every row after that is one hour: its label in the first column (
					<code>8 am–9 am</code>, with an en dash), then one cell per day. Every row must have the
					same number of columns, or the build fails.
				</p>
				<p>
					<strong>A cell reads as</strong> <code>[tag] name | pin</code>. The optional tag (
					<code>[X]</code> or <code>[SP]</code>, followed by a space) decides what&apos;s{" "}
					<em>shown</em>; the optional pin after the <em>last</em> <code>|</code> decides where a
					click <em>goes</em>. In the pin, bare numbers are DJ ids and quoted text is a search
					term, separated by commas.
				</p>
			</div>

			<div className="mt-3 overflow-x-auto">
				<table className="w-full min-w-[640px] text-left">
					<thead>
						<tr className="text-xs uppercase tracking-wide text-zinc-500">
							<th className="pb-1 pr-3 font-normal">Entry</th>
							<th className="pb-1 pr-3 font-normal">Shows as</th>
							<th className="pb-1 pr-3 font-normal">Click goes to</th>
							<th className="pb-1 font-normal">Notes</th>
						</tr>
					</thead>
					<tbody>
						<FormatRow entry="(empty)" shows="Lunokhod 3" links="/dj/?id=346">
							The auto-DJ. Runs of empty hours collapse into one row on the site.
						</FormatRow>
						<FormatRow entry="hedgebug | 796" shows="the DJ's on-air name" links="/dj/?id=796">
							The normal case. The text before the <code>|</code> is only a hint for humans —
							what shows is the on-air name from plmanager for that id.
						</FormatRow>
						<FormatRow entry="bhatman / Susan | 858,846" shows="Name1 / Name2" links="/dj/?id=858,846">
							<strong>Multiple DJs:</strong> list every id. The schedule joins their on-air names
							with &ldquo; / &rdquo;, and the link shows all of their shows together.
						</FormatRow>
						<FormatRow entry="[X] exactly THIS text | 380" shows="exactly THIS text" links="/dj/?id=380">
							<strong>Custom display name:</strong> <code>[X] </code> shows the text exactly as
							written instead of the on-air name(s). Use it to word a shared show your own way, or
							for a DJ with no on-air name set. With no pin it&apos;s plain, unlinked text.
						</FormatRow>
						<FormatRow entry="[SP] Tokyo Rewind w/ hierophant | 779" shows="Tokyo Rewind w/ hierophant" links="/dj/?id=779">
							<strong>Specialty show:</strong> like <code>[X]</code> (shows the text as written),
							but also highlighted as a specialty show.
						</FormatRow>
						<FormatRow
							entry={'[SP] Mystery Show | "Mystery Show"'}
							shows="Mystery Show"
							links="/search/?q=Mystery Show&in=shows"
						>
							<strong>Search instead of a DJ page:</strong> quote the text and the click runs a
							search of show <em>titles</em> (not tracklists). Good for rotating hosts, or a show
							filed under several DJs.
						</FormatRow>
						<FormatRow
							entry={'[SP] Local Music Hour | "local music hour", "local show"'}
							shows="Local Music Hour"
							links="/search/?q=…&q=…&in=shows"
						>
							Several quoted terms are OR&apos;d: shows matching <em>either</em> come up.
						</FormatRow>
						<FormatRow
							entry={'[SP] LOUD | 181, "LOUD"'}
							shows="LOUD"
							links="/search/?q=LOUD&dj=181&in=shows"
						>
							Mix terms and ids: still a search, with that DJ&apos;s shows folded in.
						</FormatRow>
					</tbody>
				</table>
			</div>

			<ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-zinc-400">
				<li>
					<strong>Multi-hour shows:</strong> fill each hour with the same entry. Back-to-back hours
					that render the same name merge into one tall block on the site.
				</li>
				<li>
					Spreadsheet &ldquo;smart quotes&rdquo; are fine — any of <code>&quot; &apos; “ ” ‘ ’</code>{" "}
					can open or close a search term, and they don&apos;t need to match.
				</li>
				<li>
					Only the text after the <em>last</em> <code>|</code> is the pin, and only if it&apos;s
					entirely ids and quoted terms. Anything else there (e.g. <code>Rock | Roll</code>) is kept
					as part of the name, unlinked.
				</li>
				<li>
					A plain cell (no tag) needs a DJ id pinned to show and link properly. For text that
					shouldn&apos;t link anywhere, use <code>[X]</code> with no pin.
				</li>
			</ul>
		</details>
	)
}

// Editor for one slot: what it's called, who's on, where it links, and which
// hours it covers. Works on a form (decomposeCell) and the raw cell text side
// by side — editing either updates the other.
function CellEditor({ r, c, cells, original, built, hourColumn, days, djs, djById, fuse, djStatus, onApply, onClose }) {
	const current = cells[r][c]
	const block = useMemo(() => findBlock(cells, r, c), [cells, r, c])

	const [form, setForm] = useState(() => decomposeCell(current))
	const [raw, setRaw] = useState(current)
	const [start, setStart] = useState(block.start)
	const [end, setEnd] = useState(block.end)
	const [alsoMatching, setAlsoMatching] = useState(false)
	const [termDraft, setTermDraft] = useState("")

	// on-air names of the picked DJs: the default label for a plain DJ cell
	const autoLabel = (ids) => {
		const names = ids.map((id) => djById.get(id)?.defdjname)
		return names.length && names.every(Boolean) ? names.join(" / ") : ""
	}

	const updateForm = (patch) => {
		const next = { ...form, ...patch }
		setForm(next)
		setRaw(composeCell(next, autoLabel(next.ids)))
	}

	const onRawChange = (value) => {
		setRaw(value)
		setForm(decomposeCell(value))
	}

	const setKind = (kind) => {
		// a tagged name needs text; start it from the DJs' names rather than blank
		const label = kind !== "dj" && !form.label.trim() ? autoLabel(form.ids) : form.label
		updateForm({ kind, label })
	}

	// for a plain DJ cell the label is just a hint, so drop it when the DJs
	// change and let it follow their on-air names
	const setIds = (ids) => updateForm({ ids, ...(form.kind === "dj" ? { label: "" } : {}) })
	const addDj = (dj) => {
		if (!form.ids.includes(dj.ID)) setIds([...form.ids, dj.ID])
	}
	const removeDj = (id) => setIds(form.ids.filter((x) => x !== id))

	const addTerm = () => {
		const term = termDraft.replace(/\|/g, " ").trim()
		if (term && !form.terms.includes(term)) updateForm({ terms: [...form.terms, term] })
		setTermDraft("")
	}

	const text = raw.trim()
	const preview = describeCell(text, { djById, built: text === original ? built : null })

	// round-trip check: if the text doesn't read back as the form describes, the
	// build will see something other than what's on screen
	const reread = decomposeCell(composeCell(form, autoLabel(form.ids)))
	const roundTrips =
		reread.kind === form.kind &&
		reread.ids.join() === form.ids.join() &&
		reread.terms.join("\u0000") === form.terms.map(normalizeTerm).filter(Boolean).join("\u0000")

	const suggestion = useMemo(() => {
		if (form.ids.length || !djs.length || !current) return null
		const query = suggestionQuery(current)
		return query ? fuse.search(query, { limit: 1 })[0]?.item ?? null : null
	}, [form.ids.length, djs.length, current, fuse])

	// other slots with this exact entry, outside the hours being written
	const otherMatches = useMemo(() => {
		if (!current) return []
		const hits = []
		cells.forEach((row, rr) =>
			row.forEach((cell, cc) => {
				if (cell === current && !(cc === c && rr >= start && rr <= end)) hits.push([rr, cc])
			})
		)
		return hits
	}, [cells, current, c, start, end])

	// hours in the range that currently hold something else, which will be replaced
	const overwrites = []
	for (let rr = start; rr <= end; rr += 1) {
		const cell = cells[rr][c]
		if (cell && cell !== current && cell !== text) overwrites.push({ rr, cell })
	}

	const apply = () => onApply({ col: c, start, end, text, matches: alsoMatching ? otherMatches : [] })

	const kindButton = (kind, labelText) => (
		<button
			type="button"
			onClick={() => setKind(kind)}
			className={`rounded border px-2 py-1 text-xs ${
				form.kind === kind
					? "border-[#e0ff05] bg-[#e0ff05]/10 text-[#e0ff05]"
					: "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
			}`}
		>
			{labelText}
		</button>
	)

	const pickedDjs = form.ids.map((id) => djById.get(id) || { ID: id, label: `DJ #${id}` })

	// Portalled to <body>: page content sits in a lower stacking context than the
	// site's fixed player bar and request widget, so no z-index here could clear them.
	return createPortal(
		<div className="fixed inset-0 z-[1000] flex justify-end bg-black/60" onClick={onClose}>
			<aside
				className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-700 bg-zinc-950 p-5 text-sm text-white"
				onClick={(e) => e.stopPropagation()}
				aria-label="Edit schedule slot"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-xs uppercase tracking-wide text-zinc-500">Edit slot</p>
						<h2 className="text-xl font-light">
							<span className="capitalize">{days[c]}</span> · {formatHourRange(hourColumn[r])}
						</h2>
					</div>
					<button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Close">
						✕
					</button>
				</div>
				{current !== original && (
					<p className="mt-1 break-words font-mono text-xs text-zinc-500">
						originally: {original || "(empty)"}
					</p>
				)}

				{/* what kind of slot */}
				<div className="mt-4 flex flex-wrap gap-2">
					{kindButton("dj", "DJ show")}
					{kindButton("custom", "Custom name [X]")}
					{kindButton("specialty", "Specialty [SP]")}
					{kindButton("empty", "Empty (auto-DJ)")}
				</div>

				{form.kind !== "empty" && (
					<>
						{/* name */}
						<label className="mt-4 block text-xs text-zinc-400">
							{form.kind === "dj" ? "Name hint (optional)" : "Name shown on the schedule"}
							<input
								type="text"
								value={form.label}
								onChange={(e) => updateForm({ label: e.target.value })}
								placeholder={form.kind === "dj" ? autoLabel(form.ids) || "e.g. hedgebug" : "e.g. Tokyo Rewind w/ hierophant"}
								className="mt-1 w-full rounded border border-zinc-600 bg-black px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-[#e0ff05] focus:outline-none"
							/>
						</label>
						<p className="mt-1 text-xs text-zinc-500">
							{form.kind === "dj"
								? "Ignored once a DJ is picked — the schedule shows their on-air name(s)."
								: "Shown exactly as typed, whoever is picked below."}
						</p>

						{/* DJs */}
						<div className="mt-4">
							<p className="text-xs text-zinc-400">DJ(s)</p>
							<div className="mt-1">
								<AssignedChips list={pickedDjs} onRemove={removeDj} />
							</div>
							{suggestion && (
								<div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
									<span className="text-zinc-400">Suggested:</span>
									<button
										type="button"
										onClick={() => addDj(suggestion)}
										className="rounded border border-[#e0ff05]/50 px-2 py-1 text-[#e0ff05] hover:bg-[#e0ff05]/10"
									>
										{suggestion.label} #{suggestion.ID}
									</button>
								</div>
							)}
							{djStatus === "ready" ? (
								<DjPicker djs={djs} onSelect={addDj} />
							) : (
								<p className="text-xs text-zinc-500">
									{djStatus === "loading" ? "Loading DJ list…" : "DJ list unavailable — type ids in the raw entry below."}
								</p>
							)}
							{form.ids.length > 0 && (
								<p className="mt-1 text-xs text-zinc-500">Add more for a shared show.</p>
							)}
						</div>

						{/* search terms */}
						<div className="mt-4">
							<p className="text-xs text-zinc-400">Click-through search (optional)</p>
							<p className="text-xs text-zinc-500">
								Add a term and clicking the slot searches show titles instead of opening a DJ page
								{form.ids.length ? " (the DJs above are folded into the results)" : ""}.
							</p>
							{form.terms.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-2">
									{form.terms.map((term) => (
										<span key={term} className="inline-flex items-center gap-1 rounded bg-sky-600/20 px-2 py-1 text-xs text-sky-200">
											&ldquo;{term}&rdquo;
											<button
												type="button"
												onClick={() => updateForm({ terms: form.terms.filter((t) => t !== term) })}
												aria-label={`Remove ${term}`}
												className="leading-none text-sky-300/80 hover:text-white"
											>
												×
											</button>
										</span>
									))}
								</div>
							)}
							<div className="mt-2 flex gap-2">
								<input
									type="text"
									value={termDraft}
									onChange={(e) => setTermDraft(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault()
											addTerm()
										}
									}}
									placeholder="e.g. local music hour"
									className="min-w-0 flex-1 rounded border border-zinc-600 bg-black px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-[#e0ff05] focus:outline-none"
								/>
								<button
									type="button"
									onClick={addTerm}
									className="rounded border border-zinc-600 px-3 text-xs text-zinc-200 hover:bg-zinc-800"
								>
									Add
								</button>
							</div>
						</div>
					</>
				)}

				{/* hours */}
				<div className="mt-5 rounded border border-zinc-800 p-3">
					<p className="text-xs text-zinc-400">
						Hours on <span className="capitalize">{days[c]}</span>
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
						<select
							value={start}
							onChange={(e) => {
								const v = Number(e.target.value)
								setStart(v)
								if (end < v) setEnd(v)
							}}
							className="rounded border border-zinc-600 bg-black px-2 py-1 text-white"
						>
							{hourColumn.map((h, i) => (
								<option key={i} value={i}>
									{formatHourRange(h).split("–")[0]}
								</option>
							))}
						</select>
						<span className="text-zinc-500">to</span>
						<select
							value={end}
							onChange={(e) => setEnd(Number(e.target.value))}
							className="rounded border border-zinc-600 bg-black px-2 py-1 text-white"
						>
							{hourColumn.map((h, i) =>
								i < start ? null : (
									<option key={i} value={i}>
										{formatHourRange(h).split("–")[1] ?? h}
									</option>
								)
							)}
						</select>
						<span className="text-zinc-500">
							({end - start + 1} hr{end === start ? "" : "s"})
						</span>
					</div>
					<div className="mt-2 flex flex-wrap gap-2 text-xs">
						<button
							type="button"
							onClick={() => {
								setStart(r)
								setEnd(r)
							}}
							className="text-zinc-400 underline hover:no-underline"
						>
							just this hour
						</button>
						{block.end > block.start && (
							<button
								type="button"
								onClick={() => {
									setStart(block.start)
									setEnd(block.end)
								}}
								className="text-zinc-400 underline hover:no-underline"
							>
								whole show ({block.end - block.start + 1} hrs)
							</button>
						)}
					</div>
					<p className="mt-2 text-xs text-zinc-500">
						Only these hours are written. To shorten a show, edit the hour you&apos;re dropping on
						its own.
					</p>
					{overwrites.length > 0 && (
						<ul className="mt-2 space-y-1 text-xs text-amber-300">
							{overwrites.map(({ rr, cell }) => (
								<li key={rr}>
									Replaces <span className="font-mono">{cell}</span> at {formatHourRange(hourColumn[rr])}
								</li>
							))}
						</ul>
					)}
					{otherMatches.length > 0 && (
						<label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-zinc-300">
							<input
								type="checkbox"
								checked={alsoMatching}
								onChange={(e) => setAlsoMatching(e.target.checked)}
								className="mt-0.5 accent-[#e0ff05]"
							/>
							<span>
								Also change the {otherMatches.length} other slot{otherMatches.length === 1 ? "" : "s"} with
								this exact entry (
								{otherMatches
									.slice(0, 4)
									.map(([rr, cc]) => `${days[cc]} ${formatHourRange(hourColumn[rr]).split("–")[0]}`)
									.join(", ")}
								{otherMatches.length > 4 ? ", …" : ""})
							</span>
						</label>
					)}
				</div>

				{/* raw entry */}
				<label className="mt-5 block text-xs text-zinc-400">
					schedule.csv entry
					<input
						type="text"
						value={raw}
						onChange={(e) => onRawChange(e.target.value)}
						spellCheck={false}
						placeholder="(empty — auto-DJ)"
						className="mt-1 w-full rounded border border-zinc-600 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-600 focus:border-[#e0ff05] focus:outline-none"
					/>
				</label>
				<p className="mt-1 text-xs text-zinc-500">Edit this directly if you prefer — the form above follows it.</p>

				{/* preview */}
				<div className="mt-4 rounded border border-zinc-700 bg-black p-3">
					<p className="text-xs uppercase tracking-wide text-zinc-500">On the site</p>
					<p
						className={`mt-1 break-words font-courierprime text-lg ${
							preview.kind === "specialty" ? "text-[#e0ff05] underline decoration-dotted" : preview.kind === "empty" ? "text-zinc-500" : "text-white"
						}`}
					>
						{preview.display || "(blank)"}
					</p>
					<p className="mt-1 break-all font-mono text-xs text-zinc-400">
						{preview.href ? `click → ${preview.href}` : "not clickable (plain text)"}
					</p>
					{preview.kind === "specialty" && <p className="mt-1 text-xs text-zinc-500">Highlighted as a specialty show.</p>}
					{preview.kind === "empty" && (
						<p className="mt-1 text-xs text-zinc-500">Empty hours in a row collapse into one auto-DJ row.</p>
					)}
					{[...preview.warnings, ...(roundTrips ? [] : ["This entry won't read back the way the form shows it — check the raw text."])].map(
						(w) => (
							<p key={w} className="mt-2 text-xs text-amber-300">
								⚠ {w}
							</p>
						)
					)}
				</div>

				<div className="mt-5 flex flex-wrap gap-2">
					<button
						type="button"
						onClick={apply}
						className="rounded border border-emerald-500/60 px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10"
					>
						Apply
					</button>
					{current !== original && (
						<button
							type="button"
							onClick={() => onRawChange(original)}
							className="px-2 text-xs text-zinc-400 underline hover:no-underline"
						>
							revert to original
						</button>
					)}
				</div>
			</aside>
		</div>,
		document.body
	)
}

export default function FixScheduleGrid({ headerRow, hourColumn, rawGrid, idGrid, displayGrid, error }) {
	// the grid as loaded from schedule.csv, and the working copy being edited
	const original = useMemo(
		() => rawGrid.map((row) => row.map((cell) => String(cell ?? "").trim())),
		[rawGrid]
	)
	const [cells, setCells] = useState(original)
	const [history, setHistory] = useState([]) // previous `cells`, for undo
	const [selected, setSelected] = useState(null) // { r, c } of the slot being edited
	const [restoredDraft, setRestoredDraft] = useState(false)
	const draftReady = useRef(false)

	const [djs, setDjs] = useState([])
	const [djStatus, setDjStatus] = useState("loading") // loading | ready | error
	// keep real names out of the exported CSV (see stripName in downloadCsv)
	const [stripRealNames, setStripRealNames] = useState(true)

	const days = headerRow.slice(1)

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

	// Unsaved edits are kept in this browser so a reload doesn't lose them. A
	// draft only comes back if it was made against the same schedule.csv —
	// otherwise it would silently undo whatever changed in the file since.
	const baseKey = useMemo(() => JSON.stringify(original), [original])
	useEffect(() => {
		try {
			const saved = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || "null")
			if (saved?.base === baseKey && Array.isArray(saved.cells)) {
				setCells(saved.cells)
				setRestoredDraft(true)
			}
		} catch {
			// no storage (private window etc.) — just start fresh
		}
		draftReady.current = true
	}, [baseKey])
	useEffect(() => {
		if (!draftReady.current) return
		try {
			if (JSON.stringify(cells) === baseKey) window.localStorage.removeItem(DRAFT_KEY)
			else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ base: baseKey, cells }))
		} catch {
			// storage unavailable; edits still work, they just won't survive a reload
		}
	}, [cells, baseKey])

	const djById = useMemo(() => new Map(djs.map((dj) => [dj.ID, dj])), [djs])

	// Fuzzy index over on-air names, used to suggest the most likely DJ per show.
	const fuse = useMemo(() => {
		const named = djs.filter((dj) => dj.defdjname)
		return new Fuse(named, { keys: ["defdjname"], threshold: 0.4, ignoreLocation: true })
	}, [djs])

	// build-time result for an unedited cell (null once it's been edited)
	const builtFor = (r, c) =>
		cells[r][c] === original[r][c]
			? { id: idGrid?.[r]?.[c] ?? null, display: String(displayGrid?.[r]?.[c] ?? "").trim() }
			: null

	const info = useMemo(
		() => describeGrid(cells, original, idGrid, displayGrid, djById),
		[cells, original, idGrid, displayGrid, djById]
	)
	const unresolved = useMemo(() => unresolvedSlots(cells, info), [cells, info])

	const editedCount = useMemo(
		() => cells.reduce((n, row, r) => n + row.filter((cell, c) => cell !== original[r][c]).length, 0),
		[cells, original]
	)

	const applyEdit = ({ col, start, end, text, matches }) => {
		const next = cells.map((row) => [...row])
		for (let r = start; r <= end; r += 1) next[r][col] = text
		for (const [r, c] of matches) next[r][c] = text
		setHistory((h) => [...h, cells])
		setCells(next)
		setSelected(null)
	}

	const undo = () => {
		if (!history.length) return
		setCells(history[history.length - 1])
		setHistory((h) => h.slice(0, -1))
	}

	const resetAll = () => {
		setHistory((h) => [...h, cells])
		setCells(original)
		setRestoredDraft(false)
	}

	// Rewrites a cell's display text so the exported CSV carries no real names.
	//
	// For a plain (untagged) cell the text is only a lookup hint — once an id is
	// pinned, what renders comes from the live DJ lookup — so it can be swapped
	// for the DJ's on-air name with no change to the site. Cells already tagged
	// [SP]/[X] hold a display that someone chose on purpose, so they're left be.
	// A DJ with no on-air name has nothing to swap in and would render as
	// "[NO DJ NAME FOUND]", so the cell becomes an explicit [X] first-name +
	// last-initial display — the same shape the site's own fallback produces.
	const stripName = (base, ids) => {
		if (TAG_RE.test(base)) return base

		const picked = ids.map((id) => djById.get(id))
		if (picked.length && picked.every((dj) => dj?.defdjname)) {
			return picked.map((dj) => dj.defdjname).join(" / ")
		}

		const shown = firstNameLastInitial(base)
		return shown ? `[X] ${shown}` : base
	}

	// Pinned DJs with no on-air name set in plmanager. These are the cells that
	// can't be made fully name-free on their own: with nothing to display they'd
	// render "[NO DJ NAME FOUND]", so the export falls back to a partial real
	// name. Fixing the DJ's on-air name in plmanager is the real fix.
	const missingOnAirNames = useMemo(() => {
		if (djStatus !== "ready") return []
		const byId = new Map()
		cells.forEach((row, r) => {
			row.forEach((cell, c) => {
				const { kind, label, ids } = info[r][c]
				if (kind !== "dj") return // [X]/[SP] already have a chosen display
				for (const id of ids) {
					const dj = djById.get(id)
					if (dj && !dj.defdjname && !byId.has(id)) {
						byId.set(id, { ID: id, fallback: firstNameLastInitial(label) })
					}
				}
			})
		})
		return Array.from(byId.values())
	}, [cells, info, djById, djStatus])

	// One cell as it goes into the exported CSV:
	//   - a plain cell the build resolved by name gets that id pinned, so the
	//     next build doesn't depend on the name lookup
	//   - with stripRealNames, a plain pinned cell's hint text becomes the on-air
	//     name (stripName)
	// The pin itself is kept exactly as written (quotes and all) when it's there.
	const exportCell = (text, r, c) => {
		if (!text) return ""
		const match = text.match(/^(.*)\|([^|]*)$/)
		const { base, pinnedId, searchTerms } = splitPinnedId(text)
		const hasPin = pinnedId !== null || searchTerms.length > 0
		const tail = hasPin ? match[2].trim() : null

		const ids = hasPin ? parseIds(pinnedId) : info[r][c].ids
		if (!hasPin && !ids.length) return text // nothing to pin; leave for the build

		const shown = stripRealNames && ids.length ? stripName(base, ids) : base
		return `${shown} | ${tail ?? ids.join(",")}`.trim()
	}

	const downloadCsv = () => {
		const body = cells.map((row, r) => [hourColumn[r] ?? "", ...row.map((cell, c) => exportCell(cell, r, c))])
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

	// Esc closes the editor
	useEffect(() => {
		if (!selected) return
		const onKey = (e) => {
			if (e.key === "Escape") setSelected(null)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [selected])

	const selectedBlock = selected ? findBlock(cells, selected.r, selected.c) : null

	return (
		<div className="min-h-screen px-4 py-8 text-white">
			<div className="mx-auto w-full max-w-6xl">
				<h1 className="text-3xl font-light">Fix Schedule Grid</h1>
				<p className="mt-2 max-w-3xl text-sm text-zinc-400">
					Click any hour to change who&apos;s on, what the slot is called, or where it links.
					Slots that don&apos;t link anywhere yet are flagged in red. When you&apos;re done,
					download the corrected <code>schedule.csv</code> and upload it to replace{" "}
					<code>public/uploads/schedule.csv</code>.
				</p>

				<details className="mt-4 rounded border border-zinc-700 bg-zinc-900/40 p-3 text-sm text-zinc-300">
					<summary className="cursor-pointer font-semibold text-[#e0ff05]">How to apply this</summary>
					<ol className="mt-2 list-decimal space-y-1 pl-5">
						<li>Edit the slots below, then click <strong>Download schedule.csv</strong>.</li>
						<li>
							With Tina, go to <code>/admin</code> → <strong>Media Manager</strong> → the <code>uploads</code> folder
							and upload the file, replacing the existing one. Keep the exact name{" "}
							<code>schedule.csv</code> (delete the old one first if it won&apos;t overwrite).
						</li>
						<li>
							Redeploy / rebuild the site — the schedule is parsed at <em>build time</em>, so the
							changes appear after the next deploy. Then reload this page to confirm everything resolves.
						</li>
					</ol>
					<p className="mt-2 text-xs text-zinc-400">
						Edits are kept in this browser until you download or reset, so a reload won&apos;t lose
						them.
					</p>
					<p className="mt-2 text-xs text-zinc-400">
						Tip: the DJ search matches both on-air names and real names, so a semester sheet full
						of real names (&ldquo;Matty Tintera&rdquo;) resolves without looking anyone up by hand.
						Real-name matches are labelled as such in the results.
					</p>
					<p className="mt-2 text-xs text-zinc-400">
						Leave <strong>Keep real names out of the CSV</strong> checked (the default) and each
						plain cell exports with the DJ&apos;s on-air name instead of whatever name was in the
						source sheet. The rendered schedule is identical either way — a pinned cell&apos;s text
						is only a lookup hint.
					</p>
				</details>

				<CellFormatGuide />

				{error ? (
					<p className="mt-6 rounded border border-red-500/60 bg-red-500/10 p-4 text-sm text-red-300">
						Couldn&apos;t load the schedule: {error}
					</p>
				) : (
					<>
						{djStatus === "loading" && <p className="mt-4 text-sm text-zinc-400">Loading DJ list…</p>}
						{djStatus === "error" && (
							<p className="mt-4 text-sm text-red-300">
								Couldn&apos;t load the DJ list from the API — DJ search is unavailable, but you can still
								type ids into a slot&apos;s raw entry.
							</p>
						)}
						{restoredDraft && editedCount > 0 && (
							<p className="mt-4 text-sm text-sky-300">
								Restored {editedCount} unsaved edit{editedCount === 1 ? "" : "s"} from this browser.
							</p>
						)}

						<div className="sticky top-0 z-20 mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700 bg-black/90 py-3 backdrop-blur">
							<div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
								{unresolved.length === 0 ? (
									<span>Every slot links somewhere ✓</span>
								) : (
									<>
										<span>
											<span className="font-bold text-red-400">{unresolved.length}</span> unresolved
										</span>
										<button
											type="button"
											onClick={() => setSelected(nextSlot(unresolved, selected))}
											className="rounded border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
										>
											Fix next →
										</button>
									</>
								)}
								<span className="text-zinc-500">·</span>
								<span>
									<span className="font-bold text-[#e0ff05]">{editedCount}</span> changed
								</span>
								<button
									type="button"
									onClick={undo}
									disabled={!history.length}
									className="text-xs text-zinc-400 underline hover:no-underline disabled:no-underline disabled:opacity-40"
								>
									undo
								</button>
								<button
									type="button"
									onClick={resetAll}
									disabled={!editedCount}
									className="text-xs text-zinc-400 underline hover:no-underline disabled:no-underline disabled:opacity-40"
								>
									reset all
								</button>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
									<input
										type="checkbox"
										checked={stripRealNames}
										onChange={(e) => setStripRealNames(e.target.checked)}
										className="accent-[#e0ff05]"
									/>
									<span title="Replace each plain cell's text with the DJ's on-air name. What the site renders is unchanged — the text in a pinned cell is only a lookup hint.">
										Keep real names out of the CSV
									</span>
								</label>
								<button
									type="button"
									onClick={downloadCsv}
									disabled={djStatus === "loading"}
									className={`rounded border px-4 py-2 text-sm transition-colors ${
										unresolved.length === 0
											? "border-emerald-500/60 text-emerald-300 hover:bg-emerald-500/10"
											: "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
									} disabled:cursor-not-allowed disabled:opacity-40`}
									title={
										unresolved.length === 0
											? "Download corrected schedule.csv"
											: "You can download now, but some slots still don't link anywhere"
									}
								>
									Download schedule.csv
								</button>
							</div>
						</div>

						{missingOnAirNames.length > 0 && (
							<div className="mt-4 rounded border border-amber-500/50 bg-amber-500/10 p-4 text-sm text-amber-100">
								<p className="font-semibold text-amber-300">
									{missingOnAirNames.length} pinned DJ
									{missingOnAirNames.length === 1 ? " has" : "s have"} no on-air name in plmanager
								</p>
								<p className="mt-1 text-amber-100/80">
									There&apos;s no on-air name to show for these, so the schedule would render{" "}
									<code>[NO DJ NAME FOUND]</code>. The export writes an <code>[X] First L</code> display
									instead — which still puts a partial real name in the CSV. The real fix is to set each
									DJ&apos;s on-air name in plmanager and re-export.
								</p>
								<ul className="mt-2 flex flex-wrap gap-2">
									{missingOnAirNames.map((dj) => (
										<li key={dj.ID} className="rounded bg-amber-500/20 px-2 py-1 font-mono text-xs">
											#{dj.ID}
											{dj.fallback ? ` → ${dj.fallback}` : ""}
										</li>
									))}
								</ul>
							</div>
						)}

						{/* legend */}
						<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
							<span><span className="text-white">Name</span> DJ show</span>
							<span><span className="text-sky-200">Name</span> custom name [X]</span>
							<span><span className="text-[#e0ff05]">Name</span> specialty [SP]</span>
							<span><span className="text-zinc-600">auto</span> empty (auto-DJ)</span>
							<span><span className="text-red-400">⚠</span> doesn&apos;t link anywhere</span>
							<span><span className="text-sky-300">⌕</span> links to a search</span>
							<span><span className="inline-block h-2.5 w-1 bg-[#e0ff05] align-middle" /> changed</span>
						</div>

						{/* the grid */}
						<div className="mt-3 overflow-x-auto">
							<table className="w-full min-w-[820px] table-fixed border-collapse text-xs">
								<thead>
									<tr>
										<th className="w-24 border border-zinc-800 px-1 py-1.5 font-normal text-zinc-500">
											{headerRow[0]}
										</th>
										{days.map((day) => (
											<th key={day} className="border border-zinc-800 px-1 py-1.5 font-semibold uppercase text-red-500">
												{day}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{cells.map((row, r) => (
										<tr key={r}>
											<th className="whitespace-nowrap border border-zinc-800 px-1 py-1 text-right font-normal text-zinc-400">
												{formatHourRange(hourColumn[r])}
											</th>
											{row.map((cell, c) => {
												const cellInfo = info[r][c]
												const continues = Boolean(cell) && r > 0 && cells[r - 1][c] === cell
												const continued = Boolean(cell) && r < cells.length - 1 && cells[r + 1][c] === cell
												const edited = cell !== original[r][c]
												const isSelected =
													selected && selected.c === c && r >= selectedBlock.start && r <= selectedBlock.end
												const colour =
													cellInfo.kind === "empty"
														? "text-zinc-600"
														: cellInfo.kind === "specialty"
															? "text-[#e0ff05]"
															: cellInfo.kind === "custom"
																? "text-sky-200"
																: "text-white"
												return (
													<td
														key={c}
														className={`h-px border-x border-zinc-800 p-0 ${continues ? "" : "border-t"} ${
															continued ? "" : "border-b"
														} ${!cell ? "" : cellInfo.resolved ? "" : "bg-red-500/10"}`}
													>
														<button
															type="button"
															onClick={() => setSelected({ r, c })}
															title={cell || "(empty — auto-DJ)"}
															className={`flex h-full min-h-[2rem] w-full items-start gap-1 px-1.5 py-1 text-left hover:bg-zinc-800 ${
																isSelected ? "ring-2 ring-inset ring-[#e0ff05]" : ""
															} ${edited ? "border-l-4 border-[#e0ff05]" : ""}`}
														>
															<span className={`min-w-0 flex-1 break-words leading-tight ${colour} ${continues ? "opacity-40" : ""}`}>
																{cellInfo.kind === "empty" ? "auto" : cellInfo.display}
															</span>
															{!continues && cell && !cellInfo.resolved && <span className="text-red-400">⚠</span>}
															{!continues && cellInfo.terms.length > 0 && <span className="text-sky-300">⌕</span>}
														</button>
													</td>
												)
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{selected && (
				<CellEditor
					key={`${selected.r}-${selected.c}-${history.length}`}
					r={selected.r}
					c={selected.c}
					cells={cells}
					original={original[selected.r][selected.c]}
					built={builtFor(selected.r, selected.c)}
					hourColumn={hourColumn}
					days={days}
					djs={djs}
					djById={djById}
					fuse={fuse}
					djStatus={djStatus}
					onApply={applyEdit}
					onClose={() => setSelected(null)}
				/>
			)}
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
