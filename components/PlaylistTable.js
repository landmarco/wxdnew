import React from 'react'

const columnLabels = {
	artist: 'Artist',
	song: 'Song',
	album: 'Album',
	label: 'Label',
	comments: 'Comments',
	emph: 'New',
	request: 'Request',
	comp: 'Comp',
	ensemble: 'Ensemble',
	conductor: 'Conductor',
	performer: 'Performer',
}

export default function PlaylistTable({tracks, columns}) {
	if (!tracks?.length) return <p>No tracks.</p>
	return (
		<table className="w-full table-auto text-left text-sm">
			<thead>
				<tr>
					{columns.map((key) => (
						<th key={key} className="border-b border-gray-600 px-2 py-1">
							{columnLabels[key] || key}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{tracks.map((row, idx) => (
					<tr key={row.ID || idx} className={idx % 2 ? 'bg-black/40' : ''}>
						{columns.map((key) => (
							<td key={key} className="px-2 py-1 align-top">
								{key === 'request' || key === 'comp'
									? row[key]
										? key === 'request'
											? 'R'
											: 'C'
										: ''
									: row[key]}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	)
}

