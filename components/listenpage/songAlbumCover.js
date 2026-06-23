import { useState, useEffect } from 'react';
import { getReleaseCoverUrl } from '../../lib/releaseCover';

export default function SongAlbumCover({ artist, album }) {
    const [coverUrl, setCoverUrl] = useState(null);
    const fillerNum = 1;
    const fillerSrc = `/CD_${fillerNum}_Filler.jpg`
    useEffect(() => {
        let mounted = true;
        async function loadCover() {
            const cover = await getReleaseCoverUrl(artist, album);
            if (mounted && cover) {
                setCoverUrl(cover);
            }
        }
        loadCover();
        return () => {
            mounted = false;
        };
    }, [artist, album]);
    return (
        <img
            src={coverUrl || fillerSrc}
            alt={`${artist} - ${album}`}
            className="h-16 w-16 flex-shrink-0 object-cover rounded"
        />
    );
}
