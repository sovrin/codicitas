import type {Answer, Badge} from '#/modules/module';
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

/**
 * What the modules know about a reference, ready to be shown.
 */
export type Known = {
    /**
     * Shown after the first mention; not every module shows one.
     */
    title?: string;
    /**
     * The colour the reference and its title are drawn in, like purple for a
     * merged pull request.
     */
    color?: string;
    /**
     * Drawn right before the reference, at every mention.
     */
    badge?: Badge;
    /**
     * Where the reference opens.
     */
    link?: string;
};

export type Annotated = {
    text: string;
    /**
     * Where the titles and badges were added, in code points.
     */
    notes: Range[];
};

/**
 * A text with each reference's title after its first mention: ACME-4217
 * becomes ACME-4217 (Download times out). A reference already followed by
 * brackets was described by whoever wrote it, and is left as they wrote it.
 * A badge goes before every mention, since it says how things stand rather
 * than what the reference is: ✓legacy#12.
 *
 * @param text
 * @param known reference to what is known about it, from every module
 */
export const annotate = (text: string, known: ReadonlyMap<string, Known>): Annotated => {
    if (known.size === 0) {
        return {text, notes: []};
    }

    const seen = new Set<string>();
    const notes: Range[] = [];
    let result = '';
    let length = 0;

    const add = (part: string, note?: {color?: string; badge?: boolean}) => {
        const size = Array.from(part).length;

        if (note) {
            notes.push({start: length, end: length + size, ...note});
        }

        result += part;
        length += size;
    };

    let at = 0;

    for (const match of text.matchAll(TOPIC)) {
        const [key] = match;
        const end = match.index + key.length;
        const found = known.get(key);

        if (!found) {
            continue;
        }

        const titled = !!found.title && !seen.has(key) && !/^ ?\(/.test(text.slice(end));

        if (!found.badge && !titled) {
            continue;
        }

        add(text.slice(at, match.index));

        if (found.badge) {
            add(found.badge.glyph, {
                badge: true,
                ...(found.badge.color ? {color: found.badge.color} : {}),
            });
        }

        add(key);

        if (titled) {
            seen.add(key);
            add(` (${quote(found.title, TITLE_LIMIT)})`, found.color ? {color: found.color} : {});
        }

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
            ...note,
            start: Math.max(note.start, start) - start,
            end: Math.min(note.end, end) - start,
        }));

/**
 * When a reference was last asked about, and what the answer was.
 */
export type Asked = {
    /**
     * An ISO timestamp.
     */
    at: string;
    answer: Answer | null;
};

/**
 * The references to ask a module about: the ones never asked about, and the
 * ones whose answer is no longer fresh.
 *
 * @param references every reference of the module's mentioned, resolved
 * @param asked reference to when it was last asked about
 * @param fresh how long an answer is trusted
 * @param now
 */
export const due = (
    references: string[],
    asked: ReadonlyMap<string, Asked>,
    fresh: (answer: Answer | null) => number = () => FRESH,
    now = Date.now(),
): string[] =>
    references.filter((key) => {
        const last = asked.get(key);

        return last === undefined || now - Date.parse(last.at) > fresh(last.answer);
    });
