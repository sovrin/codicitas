import {markOf, type Tag} from './journal';
import type {Found} from './store';
import {annotate} from './titles';

export type Section = {
    title: string;
    tag: Tag;
    entries: Found[];
};

/**
 * What a standup asks: what got done, what is next, what is in the way. Done
 * and blocked come from the last day journaled before today plus today so far,
 * so a Monday standup reaches back to Friday and one held late still counts
 * the morning. Next is every todo still open, however old, since a todo does
 * not stop being next by being ignored for a week.
 *
 * @param recent the entries of the days the standup covers
 * @param open every open todo
 */
export const standup = (recent: Found[], open: Found[]): Section[] => [
    {title: 'done', tag: 'done', entries: recent.filter(({tag}) => tag === 'done')},
    {title: 'next', tag: 'todo', entries: open},
    {title: 'blocked', tag: 'blocked', entries: recent.filter(({tag}) => tag === 'blocked')},
];

/**
 * Plain text for pasting into a chat. Lines after an entry's first are
 * indented under it, so a multi line entry stays one bullet, and an urgent
 * todo keeps its !! or !. References take their titles along, for whoever
 * reads it without Jira open.
 *
 * @param sections
 * @param titles
 */
export const toText = (
    sections: Section[],
    titles: ReadonlyMap<string, string> = new Map(),
): string =>
    sections
        .map(({title, entries}) =>
            [
                title.charAt(0).toUpperCase() + title.slice(1),
                ...(entries.length === 0
                    ? ['- nothing']
                    : entries.map(
                          (entry) =>
                              `- ${markOf(entry)}${annotate(entry.text, titles).text.split('\n').join('\n  ')}`,
                      )),
            ].join('\n'),
        )
        .join('\n\n');
