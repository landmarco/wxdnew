// Site-wide search input. Shared by the desktop header and the mobile top bar.
// On submit it navigates to /search?q=<text>; the results page (pages/search)
// does the actual fetching. Accepts `className` so each placement can size it.
import { useState } from 'react'
import { useRouter } from 'next/router'
import { FaSearch } from 'react-icons/fa'

const SearchBar = ({ className = '', placeholder = 'Search artists, songs, shows…' }) => {
	const router = useRouter()
	const [value, setValue] = useState('')

	const onSubmit = (event) => {
		event.preventDefault()
		const q = value.trim()
		if (!q) return
		router.push(`/search?q=${encodeURIComponent(q)}`)
	}

	return (
		<form
			role="search"
			onSubmit={onSubmit}
			className={`flex items-center gap-2 rounded-full border border-[#e0ff05]/50 bg-black/40 px-3 py-1.5 focus-within:border-[#e0ff05] ${className}`}
		>
			<FaSearch aria-hidden="true" className="shrink-0 text-[#e0ff05]" size={14} />
			<input
				type="search"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				placeholder={placeholder}
				aria-label="Search playlists and shows"
				className="w-full min-w-0 bg-transparent text-sm text-white placeholder-white/50 focus:outline-none"
			/>
		</form>
	)
}

export default SearchBar
