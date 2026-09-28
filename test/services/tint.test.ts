import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ask, codeBackground, nearest, parse, tint} from '#/services/tint';

describe('parse', () => {
    it("reads the background from a terminal's answer, however many digits it gives", () => {
        assert.deepEqual(parse('\x1b]11;rgb:ffff/0000/8080\x1b\\'), [1, 0, 0x8080 / 0xffff]);
        assert.deepEqual(parse('\x1b]11;rgb:ff/00/33\x07\x1b[?62;22c'), [1, 0, 0x33 / 0xff]);
    });

    it('finds nothing where the terminal only said what it is', () => {
        assert.equal(parse('\x1b[?62;22c'), undefined);
        assert.equal(parse(''), undefined);
    });
});

describe('tint', () => {
    it('lightens a dark background, and darkens a light one, a little', () => {
        assert.equal(tint([0x1d / 255, 0x1f / 255, 0x21 / 255]), '#2f3133');
        assert.equal(tint([1, 1, 1]), '#f0f0f0');
    });
});

describe('nearest', () => {
    it('keeps a faint shade faint in 256 colours, among the greys', () => {
        // chalk rounds this one to 59, #5f5f5f
        assert.equal(nearest('#2f2f3e'), 236);
        assert.equal(nearest('#ebebeb'), 255);
    });

    it('takes a colour from the cube where it is closer', () => {
        assert.equal(nearest('#ff0000'), 196);
        assert.equal(nearest('#5f87af'), 67);
    });
});

describe('ask', () => {
    it('asks nothing when output is not a terminal, and leaves code without a background', async () => {
        await ask(3);

        assert.equal(codeBackground(), undefined);
    });
});
