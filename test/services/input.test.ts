import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {line, repeats} from '#/services/input';

describe('line', () => {
    it('takes plain typing as it comes', () => {
        assert.deepEqual(line('a'), {text: 'a', isComplete: false});
    });

    it('keeps the text of a chunk that ends in a newline', () => {
        // a paste arrives as one chunk: dropping its text and submitting the
        // old buffer would lose everything but the first keystroke
        assert.deepEqual(line('shipped the fix\r'), {
            text: 'shipped the fix',
            isComplete: true,
        });
    });

    it('ignores whatever follows the newline', () => {
        assert.deepEqual(line('one\rtwo'), {text: 'one', isComplete: true});
    });

    it('strips control characters instead of putting them in the buffer', () => {
        assert.deepEqual(line('a\u0001b'), {text: 'ab', isComplete: false});
    });

    it('reports a bare newline as an empty complete line', () => {
        assert.deepEqual(line('\r'), {text: '', isComplete: true});
    });
});

describe('repeats', () => {
    it('counts a held key, which arrives as one chunk', () => {
        // "jjj" in a single callback used to scroll a single row
        assert.equal(repeats('jjj', 'j'), 3);
        assert.equal(repeats('j', 'j'), 1);
        assert.equal(repeats('kkk', 'j'), 0);
    });

    it('counts a repeated escape sequence', () => {
        assert.equal(repeats('\u001b[B\u001b[B', '\u001b[B'), 2);
    });

    it('counts nothing for an empty needle', () => {
        assert.equal(repeats('jjj', ''), 0);
    });
});
