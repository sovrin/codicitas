import type {Answer, Badge, Settled} from '#/modules/module';
import {codeIn, type Range, topicMatches} from './references';
import {around, render, TEMPLATES, type Templates} from './template';
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
     * What it points at is finished with: the reference is drawn faded, and
     * struck through once dropped.
     */
    settled?: Settled;
    /**
     * How things stand, drawn as its mark in colour-blind mode, and as the
     * colour of the reference's underline otherwise.
     */
    badge?: Badge;
    /**
     * Whether the badge is drawn as its mark, at every mention.
     */
    marked?: boolean;
    /**
     * The colour the reference is underlined in, saying what a badge would.
     */
    underline?: string;
    /**
     * Where the reference opens.
     */
    link?: string;
    /**
     * How the module writes its references, where it differs from the
     * defaults.
     */
    templates?: Partial<Templates>;
};

/**
 * Whether a reference is followed by what its writer said about it, in
 * brackets of either kind, which a title would only repeat.
 *
 * @param rest the text right after the reference
 */
const described = (rest: string): boolean => /^ ?[([]/.test(rest);

export type Annotated = {
    text: string;
    /**
     * Where the titles and badges were added, and where the code is, in code
     * points.
     */
    ranges: Range[];
};

/**
 * A text with each reference's title at its first mention, as its module's
 * title template has it: ACME-4217 becomes ACME-4217[Download times out]. A
 * reference already followed by brackets was described by whoever wrote it,
 * and is left as they wrote it. In colour-blind mode a badge's mark goes with
 * every mention, since it says how things stand rather than what the
 * reference is: legacy#12 ✓[Fix login]. Code is marked where it ends up, so it
 * is drawn as code, and nothing in it gets a title.
 *
 * @param text
 * @param known reference to what is known about it, from every module
 */
export const annotate = (text: string, known: ReadonlyMap<string, Known>): Annotated => {
    const code = codeIn(text);
    const seen = new Set<string>();
    const ranges: Range[] = [];
    let result = '';
    let length = 0;

    const add = (part: string, note?: Omit<Range, 'start' | 'end'>) => {
        const size = Array.from(part).length;

        if (size === 0) {
            return;
        }

        if (note) {
            ranges.push({start: length, end: length + size, ...note});
        }

        result += part;
        length += size;
    };

    // what was written, from one reference to the next, its code with it;
    // a reference is never in code, so code is always whole in here
    const written = (from: number, to: number) => {
        let at = from;

        for (const {index, 0: whole, 1: fence, 2: inside} of code) {
            if (index >= from && index < to) {
                add(text.slice(at, index));
                add(fence, {code: 'fence'});
                add(inside, {code: 'text'});
                add(fence, {code: 'fence'});
                at = index + whole.length;
            }
        }

        add(text.slice(at, to));
    };

    let at = 0;

    for (const match of known.size > 0 ? topicMatches(text) : []) {
        const [key] = match;
        const end = match.index + key.length;
        const found = known.get(key);

        if (!found) {
            continue;
        }

        const templates = {...TEMPLATES, ...found.templates};
        const titled = !!found.title && !seen.has(key) && !described(text.slice(end));
        const marked = !!found.badge && !!found.marked;

        if (!marked && !titled) {
            continue;
        }

        // the title's template around the mark's, and the mark's around the
        // reference: legacy#12 ✗[Fix login]
        const [markBefore, markAfter] = marked
            ? around(templates.mark, 'ref', {mark: found.badge.glyph})
            : ['', ''];
        const [titleBefore, titleAfter] = titled
            ? around(templates.title, 'ref', {title: quote(found.title, TITLE_LIMIT)})
            : ['', ''];
        const badge = {badge: true, ...(found.badge?.color ? {color: found.badge.color} : {})};
        // what was dropped is struck through whole, its title with it
        const title = found.settled === 'dropped' ? {struck: true} : {};

        if (titled) {
            seen.add(key);
        }

        written(at, match.index);
        add(titleBefore, title);
        add(markBefore, badge);
        add(key);
        add(markAfter, badge);
        add(titleAfter, title);
        at = end;
    }

    written(at, text.length);

    return {text: result, ranges};
};

/**
 * A text as it is copied, for whoever reads it without Jira or GitHub open:
 * each reference with its title at its first mention, as its module's copy
 * template has it - [ACME-4217](https://…) Download times out, say, for
 * Markdown. Code is copied as it was written, backticks and all.
 *
 * @param text
 * @param known reference to what is known about it, from every module
 */
export const copy = (text: string, known: ReadonlyMap<string, Known>): string => {
    const seen = new Set<string>();
    let result = '';
    let at = 0;

    for (const {index, 0: key} of topicMatches(text)) {
        const end = index + key.length;
        const found = known.get(key);

        if (!found?.title || seen.has(key) || described(text.slice(end))) {
            continue;
        }

        seen.add(key);
        result += text.slice(at, index);
        result += render({...TEMPLATES, ...found.templates}.copy, {
            ref: key,
            title: quote(found.title, TITLE_LIMIT),
            link: found.link,
            mark: found.badge?.glyph,
        });
        at = end;
    }

    return result + text.slice(at);
};

/**
 * The ranges that fall within part of a text, counted from where that part
 * starts - for a wrapped row, or a text with its first characters drawn apart.
 *
 * @param ranges
 * @param start
 * @param end
 */
export const clip = (ranges: Range[], start: number, end = Infinity): Range[] =>
    ranges
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
