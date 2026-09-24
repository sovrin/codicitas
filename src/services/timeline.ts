import {type Draft, locate, wrap} from './editor';
import {type Entry, markOf, type Priority, type Tag} from './journal';
import type {Range} from './references';
import {annotate, clip} from './titles';
import {toDuration, toMinutes} from '#/utils';

/**
 * One line of the timeline. The rail runs through all of them: entry and
 * draft rows carry a glyph on their first line and the rail after it, gap rows
 * a dotted rail with the time that passed, and the now row ends the day.
 */
export type Row =
    | {
          kind: 'entry';
          index: number;
          time: string;
          tag: Tag;
          text: string;
          isFirst: boolean;
          priority?: Priority;
          /**
           * The !! or ! a high priority todo's first row starts with, part of
           * the text so wrapping makes room for it.
           */
          mark: string;
          /**
           * Where the row shows a reference's title, counted from the row's start.
           */
          notes: Range[];
      }
    | {
          kind: 'draft';
          time: string;
          tag: Tag;
          text: string;
          isFirst: boolean;
          cursor?: number;
          ghost?: string;
      }
    | {kind: 'gap'; label?: string}
    | {kind: 'now'; time: string};

export type Composing = {
    draft: Draft;
    tag: Tag;
    /**
     * An @time typed at the start, shown before it is saved.
     */
    time?: string;
    /**
     * The rest of the name being completed, shown after the cursor.
     */
    ghost?: string;
    /**
     * The entry being edited; a new entry when missing.
     */
    index?: number;
};

type Options = {
    entries: Entry[];
    width: number;
    /**
     * The current time, on today only: the rail runs on to it.
     */
    now?: string;
    composing?: Composing;
    /**
     * Minutes from which a break is drawn - shorter is just the day going on.
     * 0 draws none.
     */
    gap?: number;
    /**
     * Whether the break before now is drawn too.
     */
    quiet?: boolean;
    /**
     * Titles of the references, shown after them and wrapped with the text.
     */
    titles?: ReadonlyMap<string, string>;
};

const gapRows = (threshold: number, from: string | undefined, to: string, suffix = ''): Row[] => {
    if (from === undefined || threshold === 0) {
        return [];
    }

    const minutes = toMinutes(to) - toMinutes(from);

    // an entry dated earlier than the one before it was written after the
    // fact; there is no stretch of time between them to show
    if (minutes < threshold) {
        return [];
    }

    return [{kind: 'gap'}, {kind: 'gap', label: `${toDuration(minutes)}${suffix}`}, {kind: 'gap'}];
};

const draftRows = ({draft, tag, ghost}: Composing, time: string, width: number): Row[] => {
    const segments = wrap(draft.buffer, width);
    const {row, column} = locate(segments, draft.buffer, draft.cursor);

    return segments.map((segment, at) => ({
        kind: 'draft',
        time,
        tag,
        text: segment.text,
        isFirst: at === 0,
        cursor: at === row ? column : undefined,
        ...(at === row && ghost ? {ghost} : {}),
    }));
};

/**
 * The day laid out line by line, ready to be drawn and scrolled.
 *
 * @param options
 */
export const layout = ({
    entries,
    width,
    now,
    composing,
    gap: threshold = 30,
    quiet = true,
    titles = new Map(),
}: Options): Row[] => {
    const rows: Row[] = [];
    const gap = (from: string | undefined, to: string, suffix?: string) =>
        gapRows(threshold, from, to, suffix);
    let previous: string | undefined;

    entries.forEach((entry, index) => {
        rows.push(...gap(previous, entry.time));

        if (composing?.index === index) {
            rows.push(...draftRows(composing, composing.time ?? entry.time, width));
        } else {
            const mark = markOf(entry);
            const {text, notes} = annotate(mark + entry.text, titles);

            rows.push(
                ...wrap(text, width).map((segment, at): Row => ({
                    kind: 'entry',
                    index,
                    time: entry.time,
                    tag: entry.tag,
                    text: segment.text,
                    isFirst: at === 0,
                    mark: at === 0 ? mark : '',
                    notes: clip(notes, segment.start, segment.end),
                    ...(entry.priority ? {priority: entry.priority} : {}),
                })),
            );
        }

        previous = entry.time;
    });

    // a new entry is written where the day has got to, taking the place of
    // the now row
    if (composing && composing.index === undefined) {
        const time = composing.time ?? now ?? previous ?? '00:00';

        rows.push(...(now ? gap(previous, now) : []), ...draftRows(composing, time, width));

        return rows;
    }

    if (now) {
        rows.push(...(quiet ? gap(previous, now, ' quiet') : []), {kind: 'now', time: now});
    }

    return rows;
};

/**
 * The first row to draw. The end of the day stays in view for as long as what
 * matters is in it; above that, what matters is pinned to the top.
 *
 * @param total
 * @param focus the first row that has to be visible
 * @param visible
 */
export const viewport = (total: number, focus: number, visible: number): number => {
    const tail = Math.max(0, total - visible);

    return focus === -1 ? tail : Math.min(focus, tail);
};

/**
 * The row the view has to keep on screen: the cursor while writing, otherwise
 * the first line of the selected entry.
 *
 * @param rows
 * @param index
 */
export const focusOf = (rows: Row[], index: number): number => {
    const cursor = rows.findIndex((row) => row.kind === 'draft' && row.cursor !== undefined);

    return cursor !== -1
        ? cursor
        : rows.findIndex((row) => row.kind === 'entry' && row.index === index);
};
