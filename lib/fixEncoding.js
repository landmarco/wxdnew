// Repairs "mojibake" — text that was UTF-8 but got decoded as Windows-1252 and
// re-encoded as UTF-8 (e.g. "Ð›ÑƒÐ½Ð¾Ñ…Ð¾Ð´ 3" instead of "Луноход 3"). Several legacy
// fields from the WXDU API are stored this way, so we repair them on display.

// Windows-1252 printable chars in the 0x80–0x9F range -> their original byte.
// Outside that range CP1252 == Latin-1, so a code point <= 0xFF IS its byte.
const CP1252_TO_BYTE = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
};

const decoder =
    typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8", { fatal: true }) : null;

// Only bother with strings that actually contain mojibake-range characters
// (Latin-1 supplement leads Â–ß plus the CP1252 special punctuation).
const MOJIBAKE_HINT =
    /[Â-ßŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/;

export function fixEncoding(str) {
    if (typeof str !== "string" || !str || !decoder) return str;
    if (!MOJIBAKE_HINT.test(str)) return str;

    const bytes = [];
    for (const ch of str) {
        const cp = ch.codePointAt(0);
        if (cp <= 0xff) bytes.push(cp);
        else if (CP1252_TO_BYTE[cp] != null) bytes.push(CP1252_TO_BYTE[cp]);
        else return str; // contains a non-CP1252 char -> assume it's already fine
    }

    try {
        // fatal:true throws when the bytes aren't valid UTF-8 — i.e. the string
        // wasn't really mojibake — so we safely keep the original.
        return decoder.decode(Uint8Array.from(bytes));
    } catch {
        return str;
    }
}

// Recursively repair every string in an API value (object / array / string).
export function fixEncodingDeep(value) {
    if (typeof value === "string") return fixEncoding(value);
    if (Array.isArray(value)) return value.map(fixEncodingDeep);
    if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) out[key] = fixEncodingDeep(value[key]);
        return out;
    }
    return value;
}
