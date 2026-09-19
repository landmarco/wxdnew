// Parses the optional pin on a schedule cell — everything after the final "|".
//
//   "Tremonti, Matthew"                 -> no pin; look the name up
//   "[X] Duo | 665,223"                 -> DJ ids, for a show with several DJs
//   '[SP] Local Music Hour | "local music hour"'
//                                       -> one search term
//   '[SP] Local Music Hour | "local music hour", "local"'
//                                       -> two terms, OR'd together
//   '[SP] Local Music Hour | "local music hour", "local", 900'
//                                       -> those terms, plus that DJ's shows
//
// Bare numbers are DJ ids; quoted strings are search terms. A tail that isn't
// made entirely of those is treated as NOT a pin, so a cell that merely contains
// a "|" keeps its whole text as the display name rather than silently losing it.

// Smart quotes matter here: schedule.csv is routinely edited in LibreOffice,
// which autocorrects "local" into “local”. Accept both so a curly quote doesn't
// quietly turn a search pin into an unparsed cell.
const QUOTE_PAIRS = {
    '"': '"',
    "'": "'",
    "“": "”", // “ ”
    "‘": "’", // ‘ ’
};

// Splits on commas that sit outside any quoted run.
function splitTopLevel(tail) {
    const parts = [];
    let current = "";
    let closer = null;

    for (const char of tail) {
        if (closer) {
            current += char;
            if (char === closer) closer = null;
        } else if (QUOTE_PAIRS[char]) {
            closer = QUOTE_PAIRS[char];
            current += char;
        } else if (char === ",") {
            parts.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

// Returns the inner text if `part` is a fully quoted string, else null.
function unquote(part) {
    const opener = part[0];
    const closer = QUOTE_PAIRS[opener];
    if (!closer || part.length < 2 || part[part.length - 1] !== closer) return null;
    return part.slice(1, -1).trim();
}

// Parses a pin tail into { ids, terms }, or null when any token is unrecognised.
function parsePinTail(tail) {
    const ids = [];
    const terms = [];

    for (const rawPart of splitTopLevel(tail)) {
        const part = rawPart.trim();
        if (!part) continue;

        const quoted = unquote(part);
        if (quoted !== null) {
            if (quoted) terms.push(quoted);
            continue;
        }
        if (/^\d+$/.test(part)) {
            ids.push(part);
            continue;
        }
        return null; // not a pin we understand — leave the cell alone
    }

    if (!ids.length && !terms.length) return null;
    return { ids, terms };
}

// Splits a cell into its display text and its pin.
// Returns { base, pinnedId, searchTerms }:
//   base        the text left of the pin (tags still attached)
//   pinnedId    comma-joined DJ ids, or null when the pin named none
//   searchTerms array of quoted search terms (empty when the pin named none)
export function splitPinnedId(cell) {
    const raw = String(cell ?? "");
    // Greedy, so the LAST "|" wins and a display name may contain one.
    const match = raw.match(/^(.*)\|([^|]*)$/);
    if (!match) {
        return { base: raw.trim(), pinnedId: null, searchTerms: [] };
    }

    const parsed = parsePinTail(match[2]);
    if (!parsed) {
        return { base: raw.trim(), pinnedId: null, searchTerms: [] };
    }

    return {
        base: match[1].trim(),
        pinnedId: parsed.ids.length ? parsed.ids.join(",") : null,
        searchTerms: parsed.terms,
    };
}

// Drops a pin tail for callers that only want the name text.
export function stripPin(cell) {
    return splitPinnedId(cell).base;
}
