// Data helper for the /all-djs page. Fetches every active DJ from the public
// WXDU API (which returns `defgenre`, `deftitle`, etc.).
//
// A specialty show is a users row with defgenre = 'Specialty'; for those,
// defdjname is the host's DJ name and deftitle is the show name (e.g.
// { defdjname: 'Dudek', deftitle: 'Wild Hare' }).
import { apiFetch } from "./api";
import { fixEncodingDeep } from "./fixEncoding";

// Value in users.defgenre that marks a row as a specialty show. See api/routes/djs.js.
export const SPECIALTY_GENRE = "Specialty";

const clean = (s) => String(s ?? "").trim();

const isSpecialty = (dj) =>
    clean(dj?.defgenre).toLowerCase() === SPECIALTY_GENRE.toLowerCase();

// "Show name with DJ name" for a specialty show, degrading gracefully if either
// piece is missing.
export function specialtyLabel(dj) {
    const show = clean(dj?.deftitle);
    const name = clean(dj?.defdjname);
    if (show && name) return `${show} with ${name}`;
    return show || name;
}

// Case-insensitive sort by the string the given accessor returns.
const byKey = (key) => (a, b) =>
    key(a).localeCompare(key(b), undefined, { sensitivity: "base" });

// All active DJs split into { djs, specialtyShows }.
//  - djs: every DJ with a real name (specialty-show hosts included, listed by
//    their DJ name), sorted by DJ name; unnamed rows are dropped.
//  - specialtyShows: only defgenre = 'Specialty', sorted by show name.
// Returns empty lists on failure so the page can still render.
export async function getAllDjs() {
    let rows;
    try {
        rows = await apiFetch(`/api/djs`);
    } catch {
        return { djs: [], specialtyShows: [] };
    }
    const list = fixEncodingDeep(Array.isArray(rows) ? rows : []);

    const djs = list
        .filter((dj) => clean(dj.defdjname))
        .sort(byKey((dj) => clean(dj.defdjname)));

    const specialtyShows = list
        .filter(isSpecialty)
        .filter((dj) => clean(dj.deftitle) || clean(dj.defdjname))
        .sort(byKey((dj) => clean(dj.deftitle) || clean(dj.defdjname)));

    return { djs, specialtyShows };
}
