import {query} from '../../../../lib/db'

export default async function handler(req, res) {
	const {id} = req.query
	try {
		const [dj] = await query('SELECT * FROM users WHERE ID = ?', [id])
		if (!dj) return res.status(404).json({message: 'DJ not found'})

		const playlists = await query(
			'\
SELECT ID, starttime, duration, title, othergenre, djname FROM shows WHERE userID = ? ORDER BY starttime DESC\
'
			,
			[id],
		)

		res.status(200).json({dj, playlists})
	} catch (err) {
		console.error(err)
		res.status(500).json({message: 'Server error'})
	}
}

