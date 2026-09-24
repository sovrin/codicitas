import {type Priority, splitPriority, splitTag, type Tag} from './journal';

export type Query = {
    tag?: Tag;
    priority?: Priority;
    /**
     * Lower case words, all of which have to occur.
     */
    terms: string[];
};

/**
 * What was typed into the search line. A leading /tag narrows by tag and a
 * !priority by priority, the same way they are set when writing, so
 * "/todo !c" lists every critical todo.
 *
 * @param text
 */
export const parse = (text: string): Query => {
    let rest = text.trimStart();
    let tag: Tag | undefined;
    let priority: Priority | undefined;

    for (let round = 0; round < 2; round++) {
        const tagged = tag ? undefined : splitTag(rest);
        const ranked = priority ? undefined : splitPriority(rest);

        if (tagged?.tag) {
            ({tag, text: rest} = tagged);
        } else if (ranked?.priority) {
            ({priority, text: rest} = ranked);
        } else {
            break;
        }
    }

    return {
        tag,
        ...(priority ? {priority} : {}),
        terms: rest.toLowerCase().split(/\s+/).filter(Boolean),
    };
};

export const isEmpty = ({tag, priority, terms}: Query): boolean =>
    tag === undefined && priority === undefined && terms.length === 0;

/**
 * The line of a multi line entry worth showing in a result: the first one that
 * matches, or the first one when only the tag did.
 *
 * @param text
 * @param terms
 */
export const snippet = (text: string, terms: string[]): string => {
    const lines = text.split('\n');
    const line = lines.find((row) => terms.some((term) => row.toLowerCase().includes(term)));

    return (line ?? lines[0]).trim();
};

export type Part = {
    text: string;
    isMatch: boolean;
};

/**
 * A line cut into matching and non matching parts, for highlighting.
 *
 * @param line
 * @param terms
 */
export const highlight = (line: string, terms: string[]): Part[] => {
    const lower = line.toLowerCase();
    const parts: Part[] = [];
    let at = 0;

    while (at < line.length) {
        let start = -1;
        let length = 0;

        for (const term of terms) {
            const found = lower.indexOf(term, at);

            if (
                found !== -1 &&
                (start === -1 || found < start || (found === start && term.length > length))
            ) {
                start = found;
                length = term.length;
            }
        }

        if (start === -1) {
            parts.push({text: line.slice(at), isMatch: false});
            break;
        }

        if (start > at) {
            parts.push({text: line.slice(at, start), isMatch: false});
        }

        parts.push({text: line.slice(start, start + length), isMatch: true});
        at = start + length;
    }

    return parts;
};
