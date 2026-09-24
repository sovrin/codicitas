import {type Range, TOPIC} from './references';
import {quote} from '#/utils';

/**
 * A title is a reminder of what the ticket was, not the ticket; past this it
 * crowds out the entry it was added to.
 */
export const TITLE_LIMIT = 48;

/**
 * How long a title is trusted before it is asked for again. Titles do change,
 * just not often enough to ask every time codi opens.
 */
export const FRESH = 7 * 24 * 60 * 60 * 1000;

export type Annotated = {
    text: string;
    /**
     * Where the titles were added, in code points.
     */
    notes: Range[];
};

/**
 * A text with each reference's title after its first mention: ACME-4217
 * becomes ACME-4217 (Download times out). A reference already followed by
 * brackets was described by whoever wrote it, and is left as they wrote it.
 *
 * @param text
 * @param titles reference to title, from every module
 */
export const annotate = (text: string, titles: ReadonlyMap<string, string>): Annotated => {
    if (titles.size === 0) {
        return {text, notes: []};
    }

    const seen = new Set<string>();
    const notes: Range[] = [];
    let result = '';
    let length = 0;
    let at = 0;

    for (const match of text.matchAll(TOPIC)) {
        const [key] = match;
        const end = match.index + key.length;
        const title = titles.get(key);

        if (!title || seen.has(key) || /^ ?\(/.test(text.slice(end))) {
            continue;
        }

        seen.add(key);

        const before = text.slice(at, end);
        const note = ` (${quote(title, TITLE_LIMIT)})`;

        length += Array.from(before).length;
        notes.push({start: length, end: length + Array.from(note).length});
        length += Array.from(note).length;
        result += before + note;
        at = end;
    }

    return {text: result + text.slice(at), notes};
};

/**
 * The notes that fall within part of a text, counted from where that part
 * starts - for a wrapped row, or a text with its first characters drawn apart.
 *
 * @param notes
 * @param start
 * @param end
 */
export const clip = (notes: Range[], start: number, end = Infinity): Range[] =>
    notes
        .filter((note) => note.end > start && note.start < end)
        .map((note) => ({
            start: Math.max(note.start, start) - start,
            end: Math.min(note.end, end) - start,
        }));

/**
 * The references to ask a module about: the ones never asked about, and the
 * ones asked about too long ago.
 *
 * @param references every reference of the module's mentioned
 * @param asked reference to when it was last asked about, as an ISO timestamp
 * @param now
 */
export const due = (
    references: string[],
    asked: ReadonlyMap<string, string>,
    now = Date.now(),
): string[] =>
    references.filter((key) => {
        const at = asked.get(key);

        return at === undefined || now - Date.parse(at) > FRESH;
    });
