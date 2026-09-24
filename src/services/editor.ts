/**
 * A multi line text buffer with a cursor. Positions count code points rather
 * than UTF-16 units, so an emoji is one step for the cursor and never split in
 * half by an edit.
 */
export type Draft = {
    buffer: string;
    cursor: number;
};

export type Segment = {
    start: number;
    end: number;
    text: string;
};

// oxlint-disable-next-line no-control-regex -- stripping them is the point
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/**
 * Soft tabs: a tab is spaces up to the next multiple of this, since what a real
 * tab looks like in a terminal is anybody's guess. The default; the tab width
 * setting passes its own.
 */
export const INDENT = 2;

const chars = (text: string): string[] => Array.from(text);

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

/**
 * A draft holding text, with the cursor at its end - where editing an existing
 * entry picks up.
 *
 * @param buffer
 */
export const draft = (buffer = ''): Draft => ({buffer, cursor: chars(buffer).length});

/**
 * Pasted text arrives with whatever line endings and tabs its source used.
 *
 * @param text
 * @param size spaces a tab becomes
 */
export const clean = (text: string, size = INDENT): string =>
    text.replace(/\r\n?/g, '\n').replace(/\t/g, ' '.repeat(size)).replace(CONTROL, '');

/**
 *
 * @param {buffer, cursor}
 * @param text
 * @param size spaces a tab in the text becomes
 */
export const insert = ({buffer, cursor}: Draft, text: string, size = INDENT): Draft => {
    const list = chars(buffer);
    const added = chars(clean(text, size));

    list.splice(cursor, 0, ...added);

    return {buffer: list.join(''), cursor: cursor + added.length};
};

/**
 * Removes everything between two positions, in either order, leaving the
 * cursor where the removed span began.
 *
 * @param {buffer}
 * @param from
 * @param to
 */
const cut = ({buffer}: Draft, from: number, to: number): Draft => {
    const list = chars(buffer);
    const [start, end] = from < to ? [from, to] : [to, from];

    list.splice(start, end - start);

    return {buffer: list.join(''), cursor: start};
};

const lineStart = (list: string[], cursor: number): number => {
    let at = cursor;

    while (at > 0 && list[at - 1] !== '\n') {
        at--;
    }

    return at;
};

const lineEnd = (list: string[], cursor: number): number => {
    let at = cursor;

    while (at < list.length && list[at] !== '\n') {
        at++;
    }

    return at;
};

const wordStart = (list: string[], cursor: number): number => {
    let at = cursor;

    while (at > 0 && /\s/.test(list[at - 1])) {
        at--;
    }

    while (at > 0 && !/\s/.test(list[at - 1])) {
        at--;
    }

    return at;
};

const wordEnd = (list: string[], cursor: number): number => {
    let at = cursor;

    while (at < list.length && /\s/.test(list[at])) {
        at++;
    }

    while (at < list.length && !/\s/.test(list[at])) {
        at++;
    }

    return at;
};

export type Motion = 'left' | 'right' | 'wordLeft' | 'wordRight' | 'home' | 'end';

/**
 * Home and end are the current line's, as in every other editor.
 *
 * @param current
 * @param motion
 */
export const move = (current: Draft, motion: Motion): Draft => {
    const list = chars(current.buffer);
    const {cursor} = current;

    const target = {
        left: () => cursor - 1,
        right: () => cursor + 1,
        wordLeft: () => wordStart(list, cursor),
        wordRight: () => wordEnd(list, cursor),
        home: () => lineStart(list, cursor),
        end: () => lineEnd(list, cursor),
    }[motion]();

    return {...current, cursor: clamp(target, 0, list.length)};
};

export type Deletion = 'back' | 'forward' | 'word' | 'lineStart' | 'lineEnd';

/**
 * The readline set: backspace, delete, ctrl+w, ctrl+u and ctrl+k. The last two
 * stop at the line, so a slip does not take a whole paragraph with it.
 *
 * @param current
 * @param deletion
 */
export const erase = (current: Draft, deletion: Deletion): Draft => {
    const list = chars(current.buffer);
    const {cursor} = current;

    const to = {
        back: () => Math.max(0, cursor - 1),
        forward: () => Math.min(list.length, cursor + 1),
        word: () => wordStart(list, cursor),
        lineStart: () => lineStart(list, cursor),
        lineEnd: () => lineEnd(list, cursor),
    }[deletion]();

    return cut(current, cursor, to);
};

/**
 * A new line that keeps the indentation of the one it breaks, so a nested list
 * goes on at its level; shift+tab steps back out.
 *
 * @param current
 */
export const newline = (current: Draft): Draft => {
    const list = chars(current.buffer);
    const start = lineStart(list, current.cursor);
    let end = start;

    while (end < current.cursor && list[end] === ' ') {
        end++;
    }

    return insert(current, `\n${' '.repeat(end - start)}`);
};

/**
 * Tab: spaces up to the next tab stop, counted from the start of the line.
 *
 * @param current
 * @param size
 */
export const indent = (current: Draft, size = INDENT): Draft => {
    const column = current.cursor - lineStart(chars(current.buffer), current.cursor);

    return insert(current, ' '.repeat(size - (column % size)));
};

/**
 * Shift+tab: takes one level of indentation off the current line, wherever the
 * cursor is on it, and leaves the cursor on the same character.
 *
 * @param current
 * @param size
 */
export const outdent = (current: Draft, size = INDENT): Draft => {
    const list = chars(current.buffer);
    const start = lineStart(list, current.cursor);
    let count = 0;

    while (count < size && list[start + count] === ' ') {
        count++;
    }

    list.splice(start, count);

    return {
        buffer: list.join(''),
        cursor: Math.max(start, current.cursor - count),
    };
};

/**
 * Breaks text into rows no wider than `width`, at a space where there is one
 * and mid word where there is not. Every row remembers where it sits in the
 * text, which is what lets the cursor be found again after wrapping.
 *
 * Width is counted in code points, so wide characters such as CJK or emoji can
 * overshoot a row; rows are drawn truncated, so that costs a character, never
 * the layout.
 *
 * @param text
 * @param width
 */
export const wrap = (text: string, width: number): Segment[] => {
    const list = chars(text);
    const limit = Math.max(1, width);
    const segments: Segment[] = [];

    const push = (start: number, end: number) => {
        segments.push({start, end, text: list.slice(start, end).join('')});
    };

    let from = 0;

    for (let at = 0; at <= list.length; at++) {
        if (at < list.length && list[at] !== '\n') {
            continue;
        }

        let start = from;

        while (at - start > limit) {
            let end = start + limit;

            for (let back = start + limit - 1; back > start; back--) {
                if (list[back] === ' ') {
                    end = back + 1;
                    break;
                }
            }

            push(start, end);
            start = end;
        }

        push(start, at);
        from = at + 1;
    }

    return segments;
};

/**
 * The row and column the cursor is drawn at. A position on a soft break
 * belongs to the row it starts, except at the very end of a line, where there
 * is no next row to move to.
 *
 * @param segments
 * @param text
 * @param cursor
 */
export const locate = (
    segments: Segment[],
    text: string,
    cursor: number,
): {row: number; column: number} => {
    const list = chars(text);

    const row = segments.findIndex(
        ({end}) => cursor < end || (cursor === end && (end === list.length || list[end] === '\n')),
    );

    const found = row === -1 ? segments.length - 1 : row;

    return {row: found, column: cursor - segments[found].start};
};

/**
 * Up and down move by the rows as drawn, keeping the column where the row is
 * long enough, the same as any editor with soft wrap.
 *
 * @param current
 * @param delta
 * @param width
 */
export const vertical = (current: Draft, delta: number, width: number): Draft => {
    const {buffer, cursor} = current;
    const segments = wrap(buffer, width);
    const {row, column} = locate(segments, buffer, cursor);
    const target = segments[row + delta];

    if (!target) {
        return current;
    }

    const list = chars(buffer);
    // the last position of a soft wrapped row is the first of the next one,
    // so stopping one short keeps the cursor on the row it was moved to
    const isSoft = target.end < list.length && list[target.end] !== '\n';
    const length = target.end - target.start - (isSoft ? 1 : 0);

    return {...current, cursor: target.start + clamp(column, 0, Math.max(0, length))};
};
