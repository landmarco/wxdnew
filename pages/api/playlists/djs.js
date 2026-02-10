import {query} from '../../../lib/db'

// Lists active DJs (users) with genre info; mirrors djlist.php ordering.
export default async function handler(req, res) {
	try {
		const users = await query(
			'\
SELECT users.* , login FROM users JOIN logins ON users.loginsID = logins.ID ORDER BY defgenre, defdjname\
'
		)
		res.status(200).json({users})
	} catch (err) {
		console.error(err)
		res.status(500).json({message: 'Server error'})
	}
}

