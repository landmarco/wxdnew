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
// whose autocorrect rewrites straight quotes as curly ones — and not always in
// matching pairs. A real cell from the schedule reads:
//
//   [SP] Out There A Minute w/ Spencer | 733, ’out there a minute'
//
// which OPENS with U+2019 (a closing curly quote) and closes with a straight
// apostrophe. So we can't require matched pairs, or that cell silently loses its
// link. Any quote character may open or close a term.
const QUOTE_CHARS = new Set(['"', "'", "\u201C", "\u201D", "\u2018", "\u2019"]);

const isQuote = (char) => QUOTE_CHARS.has(char);
const opensQuote = (part) => part.length >= 1 && isQuote(part[0]);
const closesQuote = (part) => part.length >= 2 && isQuote(part[part.length - 1]);

// Splits the tail on commas, then repairs any split that landed INSIDE a quoted
// term ("a, b" is one term, not two): a fragment that opened a quote without
// closing one swallowed the comma, so it keeps absorbing fragments until it does.
// Doing it this way rather than tracking an open-quote state means an apostrophe
// inside a term ('don't stop') doesn't read as a closing quote.
function splitTopLevel(tail) {
    const parts = [];
    let pending = null;

    for (const fragment of tail.split(",")) {
        pending = pending === null ? fragment : `${pending},${fragment}`;
        const trimmed = pending.trim();
        if (opensQuote(trimmed) && !closesQuote(trimmed)) continue;
        parts.push(pending);
        pending = null;
    }
    if (pending !== null) parts.push(pending);

    return parts;
}

// Returns the inner text if `part` is quoted at both ends, else null. The two
// quote characters need not match each other.
function unquote(part) {
    if (!opensQuote(part) || !closesQuote(part)) return null;
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
