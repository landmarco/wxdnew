export default function AlbumCover({ artist, album, cover, rank }) {
    const fillerNum = (parseInt(rank) % 3) + 1;
    const fillerSrc = `/CD_${fillerNum}_Filler.jpg`

    return (
        <img
            src={cover || fillerSrc}
            alt={`${artist} - ${album}`}
            className="h-16 w-16 flex-shrink-0 object-cover rounded"
        />
    );
}