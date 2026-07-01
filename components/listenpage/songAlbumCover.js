// This component displays the album cover for last played songs

const FILLER_IMAGE = '/CD_1_Filler.jpg'

export default function SongAlbumCover({
	artist,
	album,
	cover,
	sizeClassName = 'h-16 w-16',
	className = '',
}) {
	const altText =
		artist || album
			? `${artist || 'Unknown artist'} - ${album || 'Unknown album'}`
			: 'Album cover art'

	return (
		<img
			src={cover || FILLER_IMAGE}
			alt={altText}
			className={`${sizeClassName} flex-shrink-0 rounded-sm object-cover ${className}`}
		/>
	)
}
