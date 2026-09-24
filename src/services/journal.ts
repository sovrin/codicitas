import {type Draft, draft} from './editor';
import {resolveDue, shiftDay, toKey} from '#/utils';

export type Tag = 'note' | 'done' | 'todo' | 'blocked' | 'til' | 'meet';

export const TAGS: Tag[] = ['note', 'done', 'todo', 'blocked', 'til', 'meet'];

/**
 * 1 low, 2 mid, 3 high, 4 critical. Higher is more urgent, so sorting by it
 * puts what burns first.
 */
export type Priority = 1 | 2 | 3 | 4;

export const PRIORITIES: {value: Priority; name: string}[] = [
    {value: 1, name: 'low'},
    {value: 2, name: 'mid'},
    {value: 3, name: 'high'},
    {value: 4, name: 'critical'},
];

/**
 * What a todo without a priority counts as. Only a difference from it is
 * worth marking.
 */
export const MID: Priority = 2;

export type Entry = {
    id: number;
    /**
     * HH:MM, local.
     */
    time: string;
    tag: Tag;
    /**
     * May span several lines.
     */
    text: string;
    /**
     * Only set when chosen; a todo without one is mid.
     */
    priority?: Priority;
    /**
     * YYYY-MM-DD, the day a todo is due by. Only set when chosen.
     */
    due?: string;
};

export type View = 'journal' | 'standup' | 'search' | 'open' | 'keys' | 'settings' | 'modules';

export type Mode =
    | {kind: 'normal'}
    /**
     * Writing a line. With an index it replaces that entry instead of adding
     * one, so editing is the same prompt prefilled.
     */
    | {
          kind: 'compose';
          draft: Draft;
          tag: Tag;
          index?: number;
          /**
           * Which completion is offered, when there is more than one. Back to
           * the first whenever the text changes.
           */
          pick: number;
      }
    | {kind: 'confirm'; index: number}
    /**
     * Choosing a day to move an entry to. Any calendar day up to today, not
     * only days with entries - moving is how a day gets its first one.
     */
    | {kind: 'move'; index: number; target: string}
    /**
     * Choosing the day a todo is due, or none. The todo is held rather than
     * pointed at, since the open todos choose from every day.
     */
    | {kind: 'due'; entry: Entry; day: string; target?: string};

export type State = {
    view: View;
    today: string;
    /**
     * The day on screen.
     */
    day: string;
    /**
     * Every day with entries, plus today, newest first.
     */
    days: string[];
    entries: Entry[];
    /**
     * The selected entry.
     */
    index: number;
    mode: Mode;
    /**
     * The search line. Kept when leaving the search, so coming back picks up
     * where it was.
     */
    query: Draft;
    /**
     * The selected search result.
     */
    found: number;
    /**
     * A one line message in place of the key hints, gone with the next key.
     */
    notice?: string;
};

export type Intent =
    | {type: 'view'; view: View}
    | {type: 'today'; today: string; days: string[]}
    | {type: 'open'; day: string; entries: Entry[]; days: string[]; index?: number}
    | {type: 'entries'; entries: Entry[]; days: string[]; index?: number}
    | {type: 'move'; delta: number}
    | {type: 'compose.open'; index?: number; tag?: Tag}
    | {type: 'compose.draft'; draft: Draft}
    | {type: 'compose.tag'; delta: number}
    | {type: 'compose.pick'; delta: number}
    | {type: 'confirm.open'}
    | {type: 'move.open'}
    | {type: 'move.step'; delta: number}
    | {type: 'move.today'}
    | {type: 'due.open'; entry: Entry; day: string}
    | {type: 'due.step'; delta: number}
    | {type: 'due.today'}
    | {type: 'due.clear'}
    | {type: 'close'}
    | {type: 'query'; draft: Draft}
    | {type: 'found'; delta: number; total: number}
    | {type: 'notice'; text?: string};

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

const wrap = (value: number, length: number): number => ((value % length) + length) % length;

/**
 *
 * @param today
 */
export const initial = (today: string): State => ({
    view: 'journal',
    today,
    day: today,
    days: [today],
    entries: [],
    index: 0,
    mode: {kind: 'normal'},
    query: draft(),
    found: 0,
});

/**
 *
 * @param state
 * @param intent
 */
export const reducer = (state: State, intent: Intent): State => {
    switch (intent.type) {
        case 'view':
            return {...state, view: intent.view, mode: {kind: 'normal'}, notice: undefined};

        case 'today':
            return {...state, today: intent.today, days: intent.days};

        case 'open':
            // the newest line is the one you are most likely to act on, unless
            // a search result named another
            return {
                ...state,
                view: 'journal',
                day: intent.day,
                days: intent.days,
                entries: intent.entries,
                index: clamp(
                    intent.index ?? intent.entries.length - 1,
                    0,
                    Math.max(0, intent.entries.length - 1),
                ),
                mode: {kind: 'normal'},
            };

        case 'entries':
            return {
                ...state,
                days: intent.days,
                entries: intent.entries,
                index: clamp(
                    intent.index ?? state.index,
                    0,
                    Math.max(0, intent.entries.length - 1),
                ),
                mode: {kind: 'normal'},
            };

        case 'move':
            return {
                ...state,
                index: clamp(state.index + intent.delta, 0, Math.max(0, state.entries.length - 1)),
            };

        case 'compose.open': {
            const entry = state.entries[intent.index];

            return {
                ...state,
                mode: entry
                    ? {
                          kind: 'compose',
                          draft: draft(entry.text),
                          tag: entry.tag,
                          index: intent.index,
                          pick: 0,
                      }
                    : {kind: 'compose', draft: draft(), tag: intent.tag ?? 'note', pick: 0},
            };
        }

        case 'compose.draft':
            if (state.mode.kind !== 'compose') {
                return state;
            }

            return {...state, mode: {...state.mode, draft: intent.draft, pick: 0}};

        case 'compose.pick':
            if (state.mode.kind !== 'compose') {
                return state;
            }

            return {...state, mode: {...state.mode, pick: state.mode.pick + intent.delta}};

        case 'compose.tag': {
            if (state.mode.kind !== 'compose') {
                return state;
            }

            const tag = TAGS[wrap(TAGS.indexOf(state.mode.tag) + intent.delta, TAGS.length)];

            return {...state, mode: {...state.mode, tag}};
        }

        case 'confirm.open':
            if (state.entries.length === 0) {
                return state;
            }

            return {...state, mode: {kind: 'confirm', index: state.index}};

        case 'move.open':
            if (state.entries.length === 0) {
                return state;
            }

            // most often it was yesterday's, written down this morning
            return {
                ...state,
                mode: {
                    kind: 'move',
                    index: state.index,
                    target: shiftDay(state.day, state.day > state.today ? 0 : -1),
                },
            };

        case 'move.step': {
            if (state.mode.kind !== 'move') {
                return state;
            }

            const target = shiftDay(state.mode.target, intent.delta);

            return {
                ...state,
                mode: {...state.mode, target: target > state.today ? state.today : target},
            };
        }

        case 'move.today':
            if (state.mode.kind !== 'move') {
                return state;
            }

            return {...state, mode: {...state.mode, target: state.today}};

        case 'due.open':
            // where it stands, or today for a todo that had no date yet
            return {
                ...state,
                mode: {
                    kind: 'due',
                    entry: intent.entry,
                    day: intent.day,
                    target: intent.entry.due ?? state.today,
                },
            };

        case 'due.step': {
            if (state.mode.kind !== 'due') {
                return state;
            }

            // a due date is set for what is ahead, so choosing stops at today
            const target = shiftDay(state.mode.target ?? state.today, intent.delta);

            return {
                ...state,
                mode: {...state.mode, target: target < state.today ? state.today : target},
            };
        }

        case 'due.today':
            if (state.mode.kind !== 'due') {
                return state;
            }

            return {...state, mode: {...state.mode, target: state.today}};

        case 'due.clear':
            if (state.mode.kind !== 'due') {
                return state;
            }

            return {...state, mode: {...state.mode, target: undefined}};

        case 'close':
            return {...state, mode: {kind: 'normal'}};

        case 'query':
            return {...state, query: intent.draft, found: 0};

        case 'found':
            return {
                ...state,
                found: clamp(state.found + intent.delta, 0, Math.max(0, intent.total - 1)),
            };

        case 'notice':
            return {...state, notice: intent.text};
    }
};

/**
 * The days offered in the sidebar. Today is always there, even before anything
 * was written, so there is somewhere to start.
 *
 * @param stored
 * @param today
 */
export const listDays = (stored: string[], today: string): string[] =>
    [...new Set([...stored, today])].toSorted().toReversed();

/**
 * The neighbouring day in the list. The list runs newest first, so a positive
 * delta goes back in time - which is what "previous" means everywhere else.
 *
 * @param days
 * @param day
 * @param delta
 */
export const stepDay = (days: string[], day: string, delta: number): string => {
    const index = days.indexOf(day);

    return days[clamp((index === -1 ? 0 : index) + delta, 0, days.length - 1)] ?? day;
};

/**
 * A todo becomes done and back again. Anything else is left alone, since
 * ticking off a note means nothing.
 *
 * @param entry
 */
export const toggle = (entry: Entry): Entry => {
    switch (entry.tag) {
        case 'todo':
            return {...entry, tag: 'done'};

        case 'done':
            return {...entry, tag: 'todo'};

        default:
            return entry;
    }
};

/**
 * The tag a word names: the tag itself, or the start of exactly one tag, so
 * /d is done while /t stays text, being todo or til.
 *
 * @param word
 */
export const findTag = (word: string): Tag | undefined => {
    const lower = word.toLowerCase();

    if (TAGS.includes(lower as Tag)) {
        return lower as Tag;
    }

    const matches = TAGS.filter((tag) => tag.startsWith(lower));

    return matches.length === 1 ? matches[0] : undefined;
};

const PREFIX = /^\/(\w+)(?:\s+|$)/;

/**
 * "/todo call the bank" is a todo reading "call the bank". Anything that does
 * not name a tag is left as written, so a path like /etc/hosts survives.
 *
 * @param text
 */
export const splitTag = (text: string): {tag?: Tag; text: string} => {
    const match = PREFIX.exec(text);
    const tag = match && findTag(match[1]);

    return tag ? {tag, text: text.slice(match[0].length)} : {text};
};

const TIME = /^@(\d{1,2})(?::?(\d{2}))?([ap]m?)?(?:\s+|$)/i;

/**
 * Hours on a 24 hour clock, from what was typed: 10:30pm, 22:30 and even
 * 22:30pm mean the same, 12am is midnight, and what cannot be a time on the
 * clock it names - 13am, 25:00 - is not one.
 *
 * @param hours
 * @param suffix am or pm, when given
 */
const toHours = (hours: number, suffix?: string): number | undefined => {
    if (suffix === undefined) {
        return hours <= 23 ? hours : undefined;
    }

    const isPm = suffix.toLowerCase().startsWith('p');

    if (hours >= 1 && hours <= 12) {
        return (hours % 12) + (isPm ? 12 : 0);
    }

    // written on a 24 hour clock and marked pm anyway: pm agrees, am does not
    return isPm && hours > 12 && hours <= 23 ? hours : undefined;
};

/**
 * "@10:30 fixed the login test" happened at 10:30, whenever it was written
 * down. Takes either clock - 10:30pm, 10pm, 22:30, 2230 - whichever one the
 * times are shown in; anything else is left as text.
 *
 * @param text
 */
export const splitTime = (text: string): {time?: string; text: string} => {
    const match = TIME.exec(text);

    // a bare hour is too easily something else, @10 among them; it takes
    // minutes or an am/pm to be a time
    if (!match || (match[2] === undefined && match[3] === undefined)) {
        return {text};
    }

    const hours = toHours(Number(match[1]), match[3]);
    const minutes = Number(match[2] ?? 0);

    if (hours === undefined || minutes > 59) {
        return {text};
    }

    return {
        time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        text: text.slice(match[0].length),
    };
};

/**
 * The priority a word names: the name itself or its start - !c, !h, !m, !l.
 *
 * @param word
 */
export const findPriority = (word: string): Priority | undefined => {
    const lower = word.toLowerCase();
    const matches = PRIORITIES.filter(({name}) => name === lower || name.startsWith(lower));

    return matches.length === 1 ? matches[0].value : undefined;
};

const PRIORITY = /^!(\w+)(?:\s+|$)/;

/**
 * "!high review the retry logic" is a todo that matters more than most.
 *
 * @param text
 */
export const splitPriority = (text: string): {priority?: Priority; text: string} => {
    const match = PRIORITY.exec(text);
    const priority = match && findPriority(match[1]);

    return priority ? {priority, text: text.slice(match[0].length)} : {text};
};

const DUE = /^>(\S+)(?:\s+|$)/;

/**
 * ">fri send the report" is a todo due by Friday. The day is counted from
 * today, whichever day the entry is written on, since that is when it was
 * said. What names no day - >= among them - is left as text.
 *
 * @param text
 * @param today
 */
export const splitDue = (text: string, today: string = toKey()): {due?: string; text: string} => {
    const match = DUE.exec(text);
    const due = match ? resolveDue(match[1], today) : undefined;

    return due ? {due, text: text.slice(match[0].length)} : {text};
};

type Prefixes = {tag?: Tag; time?: string; priority?: Priority; due?: string; text: string};

/**
 * A /tag, an @time, a !priority and a >due date at the start, in any order,
 * each at most once.
 *
 * @param text
 * @param today what a due date is counted from
 */
export const splitPrefixes = (text: string, today: string = toKey()): Prefixes => {
    const found: Prefixes = {text};

    for (let round = 0; round < 4; round++) {
        const tagged = found.tag ? undefined : splitTag(found.text);
        const timed = found.time ? undefined : splitTime(found.text);
        const ranked = found.priority ? undefined : splitPriority(found.text);
        const dated = found.due ? undefined : splitDue(found.text, today);

        if (tagged?.tag) {
            found.tag = tagged.tag;
            found.text = tagged.text;
        } else if (timed?.time) {
            found.time = timed.time;
            found.text = timed.text;
        } else if (ranked?.priority) {
            found.priority = ranked.priority;
            found.text = ranked.text;
        } else if (dated?.due) {
            found.due = dated.due;
            found.text = dated.text;
        } else {
            break;
        }
    }

    return {
        tag: found.tag,
        time: found.time,
        ...(found.priority ? {priority: found.priority} : {}),
        ...(found.due ? {due: found.due} : {}),
        text: found.text,
    };
};

/**
 * The tag a text is saved as, falling back to the tag chosen otherwise.
 *
 * @param text
 * @param fallback
 */
export const extractTag = (text: string, fallback: Tag): {tag: Tag; text: string} => {
    const {tag = fallback, text: rest} = splitPrefixes(text);

    return {tag, text: rest};
};

/**
 * Turns what was typed into what gets stored, or nothing when there is nothing
 * to store. Blank lines around the text are a slip, but the first line's
 * indent and blank lines inside are meant.
 *
 * @param buffer
 * @param fallback the tag chosen when the text names none
 * @param today what a due date is counted from
 */
export const prepare = (
    buffer: string,
    fallback: Tag,
    today: string = toKey(),
): {tag: Tag; text: string; time?: string; priority?: Priority; due?: string} | undefined => {
    const {
        tag = fallback,
        time,
        priority,
        due,
        text,
    } = splitPrefixes(buffer.replace(/^\s*\n/, '').trimEnd(), today);

    if (text.trim().length === 0) {
        return undefined;
    }

    return {
        tag,
        text,
        ...(time ? {time} : {}),
        ...(priority ? {priority} : {}),
        ...(due ? {due} : {}),
    };
};

/**
 * A priority one step up or down, stopping at critical and low.
 *
 * @param entry
 * @param delta
 */
export const rank = ({priority = MID}: Entry, delta: number): Priority =>
    Math.max(1, Math.min(4, priority + delta)) as Priority;

/**
 * What goes in front of an open todo's text: !! for critical, ! for high,
 * nothing otherwise - low shows in its glyph instead.
 *
 * @param entry
 */
export const markOf = ({tag, priority = MID}: Pick<Entry, 'tag' | 'priority'>): string => {
    if (tag !== 'todo') {
        return '';
    }

    return priority === 4 ? '!! ' : priority === 3 ? '! ' : '';
};

/**
 *
 * @param entries
 */
export const count = (entries: Entry[]): Partial<Record<Tag, number>> => {
    const counts: Partial<Record<Tag, number>> = {};

    for (const {tag} of entries) {
        counts[tag] = (counts[tag] ?? 0) + 1;
    }

    return counts;
};
