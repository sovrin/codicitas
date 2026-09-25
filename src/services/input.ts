import type {Key} from 'ink';
import {type Draft, erase, indent, insert, move, newline, outdent, vertical} from './editor';
import type {Intent} from './journal';

// oxlint-disable-next-line no-control-regex -- stripping them is the point
const CONTROL = /[\u0000-\u001f\u007f]/g;
const NEWLINE = /[\r\n]/;

export type Chunk = {
    /**
     * Printable text up to the first newline, control characters removed.
     */
    text: string;
    /**
     * Whether the chunk ended the line, meaning it should be submitted.
     */
    isComplete: boolean;
};

/**
 * A terminal does not deliver one keypress at a time. Pasting, or simply typing
 * quickly, arrives as a single chunk that can carry a newline in the middle, so
 * the line is whatever precedes that newline and the rest is submitted with it.
 *
 * @param input
 */
export const line = (input: string): Chunk => {
    const index = input.search(NEWLINE);

    return {
        text: (index === -1 ? input : input.slice(0, index)).replace(CONTROL, ''),
        isComplete: index !== -1,
    };
};

/**
 * The terminal's answer to Ink asking whether it speaks the kitty keyboard
 * protocol, "[?0u" once Ink has taken the escape off. Ink reads it as a
 * keypress as well as an answer, and the journal would take the "[" for
 * going back a day - so a terminal that answers opened on yesterday.
 *
 * @param input
 */
export const isReply = (input: string): boolean => /^\[\?\d*u$/.test(input);

/**
 * How many times a key occurs in one chunk. Holding a key down arrives as "jjj"
 * in a single callback rather than three.
 *
 * @param input
 * @param needle
 */
export const repeats = (input: string, needle: string): number =>
    needle.length === 0 ? 0 : input.split(needle).length - 1;

/**
 * Shift+enter needs a terminal that speaks the kitty keyboard protocol to be
 * told apart from enter. Option+enter (meta+return) and ctrl+j (a bare line
 * feed) do the same where the protocol is missing.
 *
 * @param input
 * @param key
 */
export const isNewline = (input: string, key: Key): boolean =>
    (key.return && (key.shift || key.meta)) || input === '\n';

/**
 * What a key does to the draft, or undefined when it is not an edit.
 *
 * @param current
 * @param input
 * @param key
 * @param width the column the text wraps at, for moving up and down
 * @param size spaces a tab stands for
 */
export const edit = (
    current: Draft,
    input: string,
    key: Key,
    width: number,
    size?: number,
): Draft | undefined => {
    if (isNewline(input, key)) {
        return newline(current);
    }

    if (key.tab) {
        return key.shift ? outdent(current, size) : indent(current, size);
    }

    if (key.leftArrow || (key.meta && input === 'b')) {
        return move(current, key.meta || key.ctrl || input === 'b' ? 'wordLeft' : 'left');
    }

    if (key.rightArrow || (key.meta && input === 'f')) {
        return move(current, key.meta || key.ctrl || input === 'f' ? 'wordRight' : 'right');
    }

    if (key.upArrow || key.downArrow) {
        return vertical(current, key.upArrow ? -1 : 1, width);
    }

    if (key.home || (key.ctrl && input === 'a')) {
        return move(current, 'home');
    }

    if (key.end || (key.ctrl && input === 'e')) {
        return move(current, 'end');
    }

    if (key.backspace) {
        return erase(current, key.meta ? 'word' : 'back');
    }

    if (key.delete) {
        return erase(current, 'forward');
    }

    if (key.ctrl) {
        switch (input) {
            case 'w':
                return erase(current, 'word');

            case 'u':
                return erase(current, 'lineStart');

            case 'k':
                return erase(current, 'lineEnd');
        }
    }

    if (key.ctrl || key.meta || key.escape || key.return) {
        return undefined;
    }

    const {text} = line(input);

    return text.length > 0 ? insert(current, text, size) : undefined;
};

/**
 * What a key does while a due date is chosen: a day or a week either way,
 * today, none at all, or done with choosing - the same wherever a todo's date
 * is set.
 *
 * @param input
 * @param key
 */
export const planning = (input: string, key: Key): Intent | 'save' | 'cancel' | undefined => {
    if (key.return || input === 'y') {
        return 'save';
    }

    if (key.escape || input === 'q') {
        return 'cancel';
    }

    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
        return {type: 'due.step', delta: key.leftArrow || input === 'h' ? -1 : 1};
    }

    // a week is a row of the calendar: up is back, down is on
    if (key.upArrow || key.downArrow || input === 'k' || input === 'j') {
        return {type: 'due.step', delta: key.upArrow || input === 'k' ? -7 : 7};
    }

    if (input === 't') {
        return {type: 'due.today'};
    }

    if (key.backspace || key.delete || input === 'n') {
        return {type: 'due.clear'};
    }

    return undefined;
};
