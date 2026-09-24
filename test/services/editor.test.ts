import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    clean,
    draft,
    erase,
    indent,
    insert,
    locate,
    move,
    newline,
    outdent,
    vertical,
    wrap,
} from '#/services/editor';

const at = (buffer: string, cursor: number) => ({buffer, cursor});

describe('insert', () => {
    it('types at the cursor, not at the end', () => {
        assert.deepEqual(insert(at('fix bug', 4), 'the '), at('fix the bug', 8));
    });

    it('counts an emoji as one position', () => {
        assert.deepEqual(insert(at('🚀', 1), '!'), at('🚀!', 2));
    });

    it('normalises what a paste brings along', () => {
        assert.equal(clean('a\r\nb\rc\td\u0007'), 'a\nb\nc  d');
    });
});

describe('erase', () => {
    it('removes before and after the cursor', () => {
        assert.deepEqual(erase(at('abc', 2), 'back'), at('ac', 1));
        assert.deepEqual(erase(at('abc', 2), 'forward'), at('ab', 2));
    });

    it('does nothing at the edges', () => {
        assert.deepEqual(erase(at('abc', 0), 'back'), at('abc', 0));
        assert.deepEqual(erase(at('abc', 3), 'forward'), at('abc', 3));
    });

    it('drops the word before the cursor', () => {
        assert.deepEqual(erase(at('fixed the bug ', 14), 'word'), at('fixed the ', 10));
    });

    it('stops at the line for ctrl+u and ctrl+k', () => {
        assert.deepEqual(erase(at('one\ntwo three', 8), 'lineStart'), at('one\nthree', 4));
        assert.deepEqual(erase(at('one two\nthree', 3), 'lineEnd'), at('one\nthree', 3));
    });
});

describe('newline', () => {
    it('keeps the indentation of the line it breaks', () => {
        assert.deepEqual(newline(at('a\n    - b', 10)), at('a\n    - b\n    ', 15));
    });

    it('only carries the indent that is before the cursor', () => {
        assert.deepEqual(newline(at('    x', 2)), at('  \n    x', 5));
    });
});

describe('indent', () => {
    it('fills up to the next tab stop', () => {
        assert.deepEqual(indent(at('', 0)), at('  ', 2));
        assert.deepEqual(indent(at('x', 1)), at('x ', 2));
    });

    it('takes the tab width it is given', () => {
        assert.deepEqual(indent(at('x', 1), 4), at('x   ', 4));
        assert.deepEqual(outdent(at('      y', 7), 4), at('  y', 3));
    });

    it('counts the column from the start of the line', () => {
        assert.deepEqual(indent(at('abc\n', 4)), at('abc\n  ', 6));
    });
});

describe('outdent', () => {
    it('takes one level off the current line, wherever the cursor is', () => {
        assert.deepEqual(outdent(at('a\n    - b', 10)), at('a\n  - b', 8));
    });

    it('takes what little indent there is', () => {
        assert.deepEqual(outdent(at(' x', 2)), at('x', 1));
        assert.deepEqual(outdent(at('x', 1)), at('x', 1));
    });

    it('keeps the cursor on the line when it sat inside the indent', () => {
        assert.deepEqual(outdent(at('a\n    b', 3)), at('a\n  b', 2));
    });
});

describe('move', () => {
    it('stays inside the buffer', () => {
        assert.equal(move(at('ab', 0), 'left').cursor, 0);
        assert.equal(move(at('ab', 2), 'right').cursor, 2);
    });

    it('jumps by words', () => {
        assert.equal(move(at('fix the bug', 11), 'wordLeft').cursor, 8);
        assert.equal(move(at('fix the bug', 0), 'wordRight').cursor, 3);
    });

    it('goes to the start and end of the current line', () => {
        assert.equal(move(at('one\ntwo', 5), 'home').cursor, 4);
        assert.equal(move(at('one\ntwo', 1), 'end').cursor, 3);
    });
});

describe('wrap', () => {
    it('breaks at the last space that fits', () => {
        assert.deepEqual(
            wrap('fix the flaky test', 10).map(({text}) => text),
            ['fix the ', 'flaky test'],
        );
    });

    it('breaks mid word when there is no space', () => {
        assert.deepEqual(
            wrap('abcdefghij', 4).map(({text}) => text),
            ['abcd', 'efgh', 'ij'],
        );
    });

    it('keeps hard line breaks, empty lines included', () => {
        assert.deepEqual(
            wrap('one\n\ntwo', 10).map(({text}) => text),
            ['one', '', 'two'],
        );
    });

    it('gives an empty text one row', () => {
        assert.equal(wrap('', 10).length, 1);
    });

    it('records where each row sits in the text', () => {
        assert.deepEqual(
            wrap('ab cd\nef', 3).map(({start, end}) => [start, end]),
            [
                [0, 3],
                [3, 5],
                [6, 8],
            ],
        );
    });
});

describe('locate', () => {
    const text = 'ab cd\nef';
    const segments = wrap(text, 3);

    it('puts a position on a soft break at the start of the next row', () => {
        assert.deepEqual(locate(segments, text, 3), {row: 1, column: 0});
    });

    it('keeps the end of a line on that line', () => {
        assert.deepEqual(locate(segments, text, 5), {row: 1, column: 2});
        assert.deepEqual(locate(segments, text, 8), {row: 2, column: 2});
    });
});

describe('vertical', () => {
    it('moves between rows as drawn, keeping the column', () => {
        assert.equal(vertical(at('abcdef', 1), 1, 3).cursor, 4);
        assert.equal(vertical(at('abcdef', 4), -1, 3).cursor, 1);
    });

    it('lands at the end of a shorter row', () => {
        assert.equal(vertical(at('abcdef\nx', 5), 1, 10).cursor, 8);
    });

    it('stays on a soft wrapped row rather than slipping to the next', () => {
        const {cursor} = vertical(at('abc def ghi', 10), -1, 4);

        assert.deepEqual(locate(wrap('abc def ghi', 4), 'abc def ghi', cursor).row, 1);
    });

    it('does nothing past the first or last row', () => {
        assert.deepEqual(vertical(draft('abc'), 1, 10), draft('abc'));
    });
});
