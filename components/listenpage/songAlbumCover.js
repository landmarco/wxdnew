const FILLER_IMAGE = '/CD_1_Filler.jpg';

export default function SongAlbumCover({ artist, album, cover }) {
    
    return (
        <img
            src={cover || FILLER_IMAGE}
            alt={`${artist} - ${album}`}
            className="h-16 w-16 flex-shrink-0 object-cover rounded"
        />
    );
}