/**
 * A ticket as Jira names it: the project key, a dash and the number.
 */
const KEY = '[A-Z][A-Z0-9]+-\\d+';

/**
 * What an entry points at: a #topic, an issue or pull request number like
 * #412, or a ticket like PROJ-123. Not preceded by a word character or #, so
 * C# and ## headings stay text.
 */
const TOPIC = new RegExp(`(?<![\\w#])(?:#\\w[\\w-]*|${KEY})\\b`, 'g');

/**
 * A ticket on its own, the part of a topic Jira can say more about.
 */
export const TICKET = new RegExp(`(?<![\\w#])${KEY}\\b`, 'g');

/**
 *
 * @param name a topic as written
 */
export const isTicket = (name: string): boolean => new RegExp(`^${KEY}$`).test(name);

/**
 * Who an entry is about: @anna, @jan-erik, @anna.k. It starts with a letter,
 * which is what keeps it apart from a time like @10:30, and ends on one, so
 * "thanks @anna." leaves the full stop out. Not preceded by a word character,
 * so an email address stays text.
 */
const PERSON = /(?<![\w@])@[a-zA-Z](?:[\w.-]*\w)?/g;

export type Part = {
    text: string;
    isReference: boolean;
    /**
     * Added for the reader rather than written - a ticket's title - and drawn
     * faded, so it is never mistaken for the entry itself.
     */
    isNote?: boolean;
};

/**
 * A stretch of a text, in code points, the way the editor counts.
 */
export type Range = {
    start: number;
    end: number;
};

/**
 * Every topic, ticket and person in a text, in order.
 *
 * @param text
 */
const find = (text: string): RegExpMatchArray[] =>
    [...text.matchAll(TOPIC), ...text.matchAll(PERSON)].toSorted((a, b) => a.index - b.index);

/**
 * A line cut into references and the text around them, and around the notes
 * added to it, which are never searched for references of their own.
 *
 * @param text
 * @param notes
 */
export const references = (text: string, notes: Range[] = []): Part[] => {
    if (notes.length > 0) {
        const list = Array.from(text);
        const parts: Part[] = [];
        let at = 0;

        for (const {start, end} of notes.toSorted((a, b) => a.start - b.start)) {
            if (start > at) {
                parts.push(...references(list.slice(at, start).join('')));
            }

            if (end > Math.max(at, start)) {
                parts.push({
                    text: list.slice(Math.max(at, start), end).join(''),
                    isReference: false,
                    isNote: true,
                });
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
 * Every colleague and topic an entry mentions, each once.
 *
 * @param text
 */
export const mentionsIn = (text: string): Mention[] => {
    const found = new Map<string, Mention>();

    for (const [name] of text.matchAll(PERSON)) {
        found.set(`person ${name}`, {kind: 'person', name});
    }

    for (const [name] of text.matchAll(TOPIC)) {
        found.set(`topic ${name}`, {kind: 'topic', name});
    }

    return [...found.values()];
};

/**
 * Every ticket in some texts, each once, in the order they first appear.
 *
 * @param texts
 */
export const ticketsIn = (...texts: string[]): string[] => [
    ...new Set(texts.flatMap((text) => [...text.matchAll(TICKET)].map(([key]) => key))),
];

/**
 * The first #topic or ticket in an entry, to search for everything else about
 * it.
 *
 * @param text
 */
export const firstReference = (text: string): string | undefined => text.match(TOPIC)?.[0];

/**
 * The first colleague an entry mentions, to search for everything with them.
 *
 * @param text
 */
export const firstPerson = (text: string): string | undefined => text.match(PERSON)?.[0];
