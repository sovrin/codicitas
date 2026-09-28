/**
 * A ticket as Jira names it: the project key, a dash and the number.
 */
const KEY = '[A-Z][A-Z0-9]+-\\d+';

/**
 * An issue or pull request of a repository known by a short name: legacy#12.
 * The name starts with a letter and ends on a letter or digit.
 */
const NUMBERED = '[A-Za-z](?:[\\w.-]*\\w)?#\\d+';

/**
 * What an entry points at: a #topic, an issue or pull request number like
 * #412 or legacy#12, or a ticket like PROJ-123. Not preceded by a word
 * character or #, so C# and ## headings stay text; legacy#12 not by a path
 * or an address either, so a link's anchor stays text.
 */
export const TOPIC = new RegExp(
    `(?:(?<![\\w#])(?:#\\w[\\w-]*|${KEY})|(?<![\\w#/.@-])${NUMBERED})\\b`,
    'g',
);

/**
 * Whether a topic is a ticket, rather than a #topic or #412.
 *
 * @param name a topic as written
 */
export const isTicket = (name: string): boolean => new RegExp(`^${KEY}$`).test(name);

/**
 * Whether a topic is a repository's issue or pull request, like legacy#12.
 *
 * @param name a topic as written
 */
export const isNumbered = (name: string): boolean => new RegExp(`^${NUMBERED}$`).test(name);

/**
 * Who an entry is about: @anna, @jan-erik, @anna.k. It starts with a letter,
 * which is what keeps it apart from a time like @10:30, and ends on one, so
 * "thanks @anna." leaves the full stop out. Not preceded by a word character,
 * so an email address stays text.
 */
const PERSON = /(?<![\w@])@[a-zA-Z](?:[\w.-]*\w)?/g;

/**
 * Code, the way Markdown writes it: between two runs of backticks of the same
 * length, so ``a`b`` holds a backtick. It may run over lines, which makes
 * ``` on lines of their own a block. A backtick without a partner is text.
 */
const CODE = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;

/**
 * Every stretch of code in a text, in order: the whole match, then its
 * backticks and what is between them.
 *
 * @param text
 */
export const codeIn = (text: string): RegExpMatchArray[] => [...text.matchAll(CODE)];

/**
 * A text with its code blanked out, each character a space, so what is in it
 * is taken literally and never as a reference, and everything else stays
 * where it was.
 *
 * @param text
 */
const literal = (text: string): string => text.replace(CODE, (code) => ' '.repeat(code.length));

/**
 * Every topic in a text, tickets included, leaving out what is code.
 *
 * @param text
 */
export const topicMatches = (text: string): RegExpMatchArray[] => [
    ...literal(text).matchAll(TOPIC),
];

export type Part = {
    text: string;
    isReference: boolean;
    /**
     * Added for the reader rather than written - a ticket's title - and drawn
     * faded, so it is never mistaken for the entry itself.
     */
    isNote?: boolean;
    /**
     * A note in a colour of its own, like a merged pull request's title.
     */
    color?: string;
    /**
     * A mark rather than words, like the status of a pull request's checks:
     * drawn in its colour at full strength rather than faded.
     */
    isBadge?: boolean;
    /**
     * Struck through, like the title of something dropped.
     */
    isStruck?: boolean;
    /**
     * Code as written, taken literally: its backticks, drawn faded, or what
     * is between them.
     */
    code?: Code;
};

type Code = 'fence' | 'text';

/**
 * A stretch of a text, in code points, the way the editor counts: a note, or
 * code. A note carries the colour it is drawn in, when it has one.
 */
export type Range = {
    start: number;
    end: number;
    color?: string;
    badge?: boolean;
    struck?: boolean;
    code?: Code;
};

/**
 * Every topic, ticket and person in a text, in order.
 *
 * @param text
 */
const find = (text: string): RegExpMatchArray[] => {
    const plain = literal(text);

    return [...plain.matchAll(TOPIC), ...plain.matchAll(PERSON)].toSorted(
        (a, b) => a.index - b.index,
    );
};

/**
 * A line cut into references and the text around them, and around the
 * ranges marked in it - the notes added to it and its code - which are never
 * searched for references.
 *
 * @param text
 * @param ranges
 */
export const references = (text: string, ranges: Range[] = []): Part[] => {
    if (ranges.length > 0) {
        const list = Array.from(text);
        const parts: Part[] = [];
        let at = 0;

        for (const {start, end, color, badge, struck, code} of ranges.toSorted(
            (a, b) => a.start - b.start,
        )) {
            if (start > at) {
                parts.push(...references(list.slice(at, start).join('')));
            }

            if (end > Math.max(at, start)) {
                const part = list.slice(Math.max(at, start), end).join('');

                parts.push(
                    code
                        ? {text: part, isReference: false, code}
                        : {
                              text: part,
                              isReference: false,
                              isNote: true,
                              ...(color ? {color} : {}),
                              ...(badge ? {isBadge: true} : {}),
                              ...(struck ? {isStruck: true} : {}),
                          },
                );
                at = end;
            }
        }

        if (at < list.length || parts.length === 0) {
            parts.push(...references(list.slice(at).join('')));
        }

        return parts;
    }

    const parts: Part[] = [];
    let at = 0;

    for (const match of find(text)) {
        if (match.index > at) {
            parts.push({text: text.slice(at, match.index), isReference: false});
        }

        parts.push({text: match[0], isReference: true});
        at = match.index + match[0].length;
    }

    if (at < text.length || parts.length === 0) {
        parts.push({text: text.slice(at), isReference: false});
    }

    return parts;
};

export type Kind = 'person' | 'topic';

export type Mention = {
    kind: Kind;
    /**
     * As written: @anna, #auth, PROJ-12.
     */
    name: string;
};

/**
 * Every colleague and topic an entry mentions outside its code, each once.
 *
 * @param text
 */
export const mentionsIn = (text: string): Mention[] => {
    const found = new Map<string, Mention>();
    const plain = literal(text);

    for (const [name] of plain.matchAll(PERSON)) {
        found.set(`person ${name}`, {kind: 'person', name});
    }

    for (const [name] of plain.matchAll(TOPIC)) {
        found.set(`topic ${name}`, {kind: 'topic', name});
    }

    return [...found.values()];
};

/**
 * Every topic in some texts, tickets included, each once, in the order they
 * first appear.
 *
 * @param texts
 */
export const topicsIn = (...texts: string[]): string[] => [
    ...new Set(texts.flatMap((text) => topicMatches(text).map(([name]) => name))),
];

/**
 * The first #topic or ticket in an entry, to search for everything else about
 * it.
 *
 * @param text
 */
export const firstReference = (text: string): string | undefined => topicMatches(text)[0]?.[0];

/**
 * The first colleague an entry mentions, to search for everything with them.
 *
 * @param text
 */
export const firstPerson = (text: string): string | undefined => literal(text).match(PERSON)?.[0];
