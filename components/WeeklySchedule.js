import { useEffect, useRef } from "react"
import Link from "next/link"
import { djHref, AUTO_DJ_ID } from "@/lib/djLink"

/*
Receives parsed CSV data from lib/scheduleParser.js and renders a weekly grid.
headerRow includes value of corner cell A1, but is removed from hourColumn

fullArray is what scheduleParser.js returns (25x8)

[0] headerRow = fullArray[0]   (1 row, 8 columns)
[1] hourColumn = fullArray.map(row => row[0]).slice(1)   (rotates hour column into 1 row, 24 columns)
[2] specialtyShowIndices = []   (marks indexes of all specialty shows [WIP])
[3] djNameOnlyArray = [] (starts out as fullNameOnlyArray but gets overwritten)     (24 rows, 7 columns)
[4] idGrid     (same dimensions as [3] but with MySQL ids)
*/

// adding functionality to collapse 2+ otto-only rows to save space
const ottoAlias = "Луноход 3"
function isOttofulRow(hourRow) {
	const djCells = hourRow.slice(1)

	return (
		djCells.some((cell) => cell === ottoAlias) &&
		djCells.every((cell) => !cell || cell === ottoAlias)
	)
}

// checks if there's 2+ consecutive rows where for all days of the week, it's just otto
// alias = Lunohkod 3
function whichRowsCollapse(hourRows) {
	const rows = []
	let i = 0

	while (i < hourRows.length) {
		if (!isOttofulRow(hourRows[i])) {
			rows.push({ type: "normal", row: hourRows[i], originalRowIndex: i })
			i += 1
			continue
		}

		let j = i + 1
		while (j < hourRows.length && isOttofulRow(hourRows[j])) {
			j += 1
		}

		const block = hourRows.slice(i, j)

		if (block.length >= 2) {
			rows.push({
				type: "ottoCollapse",
				startHour: block[0][0],
				endHour: block[block.length - 1][0],
				cells: block[0].slice(1).map((_, dayIndex) =>
					block.some((row) => row[dayIndex + 1] === ottoAlias) ? ottoAlias : ""
				),
			})
		} else {
			rows.push({ type: "normal", row: hourRows[i], originalRowIndex: i })
		}

		i = j
	}

	return rows
}

export default function WeeklySchedule({schedule}) {
	const scheduleScrollerRef = useRef(null)
	const todayHeaderRef = useRef(null)
	const firstColumnHeaderRef = useRef(null)

	// because I"m lazy and I don"t want to rewrite the array logic below (which accounts for headers),
	// I"m going to simply reconstruct the carrier into full array with header and feed it in
	const headerSource = Array.isArray(schedule?.[0]) ? schedule[0] : []
	const hourColumn = Array.isArray(schedule?.[1]) ? schedule[1] : []
	const showGrid = Array.isArray(schedule?.[3]) ? schedule[3] : []
	const reconstructedSchedule = headerSource.length && showGrid.length
		? [
			headerSource,
			...showGrid.map((row, i) => [hourColumn[i], ...(Array.isArray(row) ? row : [])])
		]
		: []

	// init arrays
	const headerRow = reconstructedSchedule[0] || []
	const hourRows = reconstructedSchedule.slice(1)
	const days = headerRow
	const todayColumnIndex = days.findIndex(
		(day, dayIndex) =>
			dayIndex > 0 &&
			String(day || "").trim().toLowerCase() ===
				new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
	)

	useEffect(() => {
		const scroller = scheduleScrollerRef.current
		const todayHeader = todayHeaderRef.current
		if (!scroller || !todayHeader || todayColumnIndex <= 0) return
		if (!window.matchMedia("(max-width: 1023px)").matches) return

		const stickyWidth = firstColumnHeaderRef.current?.getBoundingClientRect().width || 0
		scroller.scrollLeft = Math.max(todayHeader.offsetLeft - stickyWidth, 0)
	}, [todayColumnIndex])

	// MySQL id grid aligned with the dj-name grid (schedule[3]); used to link cells
	const idGrid = Array.isArray(schedule?.[4]) ? schedule[4] : []

	// make sure we aren"t passing in non-arrays or nothing
	if (!Array.isArray(reconstructedSchedule) || reconstructedSchedule.length === 0) {
		return null
	}

	const collapseAwareHourRows = whichRowsCollapse(hourRows)
	const specialtyShowIndices = schedule?.[2] || []

	// checks for specialty shows, so we can format them differently
	function isSpecialtyShow(rowIndex, dayIndex) {
		return specialtyShowIndices.some(
			([specialtyRowIndex, specialtyDayIndex]) =>
				specialtyRowIndex === rowIndex && specialtyDayIndex === dayIndex
		)
	}

	// reads the visible DJ cell value from either row type so merge logic can cross ottoCollapse rows
	function getRenderedDjValue(renderedRow, dayIndex) {
		if (!renderedRow) {
			return null
		}

		if (renderedRow.type === "normal") {
			return renderedRow.row?.[dayIndex + 1] ?? ""
		}

		if (renderedRow.type === "ottoCollapse") {
			return renderedRow.cells?.[dayIndex] ?? ""
		}

		return ""
	}

	const firstColumnClass = "sticky left-0 z-10 w-20 min-w-[5rem] max-w-[5rem] break-words border border-gray-300 bg-white px-2 py-2 text-center text-base leading-tight uppercase text-red-600 lg:w-auto lg:min-w-0 lg:max-w-none lg:px-4 lg:text-right lg:text-xl lg:whitespace-nowrap"

	return (
		<div ref={scheduleScrollerRef} className="mx-auto h-[80vh] w-[calc(100vw-1rem)] max-w-full overflow-auto text-lg font-semibold tracking-[-0.07em] text-[#e0ff05] lg:w-[80vw] lg:text-xl">
			<table className="min-w-[720px] table-fixed border-separate border-spacing-0 lg:w-full lg:min-w-0 lg:table-auto">
                    <caption className="sr-only">
                        WXDU on-air show schedule with DJ names per hour
                    </caption>

                {/* table header row, including cell A1 ("show start time" or something) */}
				<thead>
					<tr>
						{days.map((day, dayIndex) => (
							<th
								key={dayIndex}
								ref={dayIndex === 0 ? firstColumnHeaderRef : dayIndex === todayColumnIndex ? todayHeaderRef : null}
								className={`sticky border border-gray-300 px-2 py-2 text-lg uppercase lg:px-4 lg:text-xl ${
									dayIndex === 0
										? "top-0 left-0 z-50 w-20 min-w-[5rem] max-w-[5rem] break-words bg-black text-base leading-tight lg:w-auto lg:min-w-0 lg:max-w-none lg:text-xl"
										: "top-0 z-30 bg-white text-red-600"
								}`}
							>
								{dayIndex === 0 ? "summer 2026" : day}
							</th>
						))}
					</tr>
				</thead>

                {/* table body!! */}
				<tbody>

					{collapseAwareHourRows.map((collapseAwareHourRow, rowIndex) => {
						if (collapseAwareHourRow.type === "ottoCollapse") {
							return (
								<tr key={`lunokhod-${collapseAwareHourRow.startHour}-${rowIndex}`}>
									<th className={firstColumnClass}>
										{
											collapseAwareHourRow.startHour.replace(/–.*$/, "")
										}↔↔{
											collapseAwareHourRow.endHour.replace(/^.*–/, "")
										}
									</th>

									{collapseAwareHourRow.cells.map((djName, dayIndex) => (
										(() => {
											// skip duplicate cell if a rowSpan from above already covers this column
											const previousRow = collapseAwareHourRows[rowIndex - 1]
											const previousDj = getRenderedDjValue(previousRow, dayIndex)
											if (djName && previousDj === djName) {
												return null
											}

											// collapse blocks count as one visible row in rowSpan math
											let rowSpan = 1
											while (
												djName &&
												getRenderedDjValue(collapseAwareHourRows[rowIndex + rowSpan], dayIndex) === djName
											) {
												rowSpan += 1
											}

											return (
												<td
													key={`lunokhod-${dayIndex}`}
													rowSpan={rowSpan}
													// h-px gives the cell a definite height so the Link's h-full can fill the whole (taller) cell
													className="h-px border border-gray-300 bg-black text-center align-middle"
												>
													{djName && (
														// otto rows are the auto-DJ — link to the auto-DJ show list
														// Link fills the whole cell so the entire cell is clickable, not just the text.
															<Link href={djHref(AUTO_DJ_ID)} legacyBehavior={false} className="flex h-full items-center justify-center px-2 py-2 hover:underline lg:px-4">
																{djName}
															</Link>
													)}
												</td>
											)
										})()
									))}
								</tr>
							)
						}

						// these are normal, non-collapsing rows
						const hourRow = collapseAwareHourRow.row
						const hour = hourRow[0]
						const djCells = hourRow.slice(1)

						return (
							<tr key={`${hour}-${rowIndex}`}>

                                {/* first column is the hour */}
								<th scope="row" className={firstColumnClass}>
									{hour}
								</th>

                                {/* loop for remaining columns, including multi-hour show logic */}
								{djCells.map((djName, dayIndex) => {
									if (!djName) {
										return (
												<td
													key={`${hour}-${dayIndex}`}
													className="border border-gray-300 bg-black px-2 py-2 lg:px-4"
												/>
										)
									}

										// checks if current cell is specialty show
										const specialtyShow = isSpecialtyShow(collapseAwareHourRow.originalRowIndex, dayIndex)

										// Skip repeated cells so rowSpan can cover multi-hour shows.
										const previousRow = collapseAwareHourRows[rowIndex - 1]
										const previousDj = getRenderedDjValue(previousRow, dayIndex)

										if (previousDj === djName) {
											return null
										}


										let rowSpan = 1
										while (getRenderedDjValue(collapseAwareHourRows[rowIndex + rowSpan], dayIndex) === djName) {
											rowSpan += 1
										}

										// resolved MySQL id for this cell; null for specialty/custom/unmatched
										// cells, which then render as plain text instead of linking to Otto.
										const djId = idGrid?.[collapseAwareHourRow.originalRowIndex]?.[dayIndex]
										const href = djHref(djId)

										return (
											<td
												key={`${hour}-${dayIndex}`}
												rowSpan={rowSpan}
												// h-px gives the cell a definite height so the Link's h-full can fill the whole (taller) cell
												className={`h-px border border-gray-300 text-center align-middle ${
													specialtyShow ? "bg-[#e0ff05] text-black" : "bg-black" // HIGHLIGHT SPECIALTY SHOWS!!!
												}`}
											>
												{/* Link fills the whole cell so the entire cell is clickable, not just the text.
												    Cells without a resolved DJ id show as plain, non-clickable text. */}
												{href ? (
													<Link href={href} legacyBehavior={false} className="flex h-full items-center justify-center px-2 py-2 hover:underline lg:px-4">
														{djName}
													</Link>
												) : (
													<span className="flex h-full items-center justify-center px-2 py-2 lg:px-4">
														{djName}
													</span>
												)}
										</td>
									)
								})}
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}
