// function to get the album cover for each song.
export default async function getCovers(artist, song, album){
    const res = await fetch(`/api/albumCover?artist=${encodeURIComponent(artist)}&song=${encodeURIComponent(song)}&album=${encodeURIComponent(album)}`);
    if (!res.ok) {
        throw new Error(`Cover search failed: ${res.status}`);
    }

    const cover = await res.json();
    return cover;
}