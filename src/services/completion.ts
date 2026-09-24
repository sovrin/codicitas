import type {Draft} from './editor';
import type {Kind} from './references';

export type Token = {
    kind: Kind;
    /**
     * As typed so far, sigil included: "@an".
     */
    typed: string;
    /**
     * Where it starts, in code points.
     */
    start: number;
};

const chars = (text: string): string[] => Array.from(text);

/**
 * The @name or #topic being typed: the cursor right behind it, nothing but
 * name characters since the sigil. A bare @ counts, so the people used most
 * are offered before a letter is typed; @ and a digit is a time on its way,
 * and never a name.
 *
 * @param draft
 */
export const tokenAt = ({buffer, cursor}: Draft): Token | undefined => {
    const list = chars(buffer);

    // in the middle of a word there is nothing to complete
    if (/[\w.-]/.test(list[cursor] ?? ' ')) {
        return undefined;
    }

    const before = list.slice(0, cursor).join('');
    const match = /(?<![\w@#])([@#])([\w.-]*)$/.exec(before);

    if (!match) {
        return undefined;
    }

    const [typed, sigil, name] = match;

    if (sigil === '@' && name.length > 0 && !/^[a-zA-Z]/.test(name)) {
        return undefined;
    }

    return {
        kind: sigil === '@' ? 'person' : 'topic',
        typed,
        start: cursor - chars(typed).length,
    };
};

/**
 * Names that carry on from what was typed, in the order they were given -
 * most used first. What is already typed out in full is not offered again.
 *
 * @param token
 * @param names
 * @param limit
 */
export const candidates = ({typed}: Token, names: string[], limit = 5): string[] => {
    const lower = typed.toLowerCase();

    return names
        .filter((name) => name.toLowerCase().startsWith(lower) && name.toLowerCase() !== lower)
        .slice(0, limit);
};

/**
 * What the chosen name adds after the cursor, shown dimmed until taken.
 *
 * @param token
 * @param name
 */
export const ghost = ({typed}: Token, name: string): string =>
    chars(name).slice(chars(typed).length).join('');

/**
 * The draft with the token replaced by the name and a space after it, unless
 * one is there already.
 *
 * @param draft
 * @param token
 * @param name
 */
export const complete = ({buffer, cursor}: Draft, {start}: Token, name: string): Draft => {
    const list = chars(buffer);
    const rest = list.slice(cursor);
    const hasSpace = rest[0] === ' ';
    const done = [...list.slice(0, start), ...chars(hasSpace ? name : `${name} `)];

    // past the space either way, ready for the next word
    return {buffer: [...done, ...rest].join(''), cursor: done.length + (hasSpace ? 1 : 0)};
};
