import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {annotate, clip, copy, due, FRESH} from '#/services/titles';

const TITLES = new Map([
    ['ACME-4217', {title: 'Download times out'}],
    ['OPS-7', {title: 'Rotate the staging certificates before they expire next month'}],
]);

describe('annotate', () => {
    it('adds a title after each ticket it knows, saying where', () => {
        assert.deepEqual(annotate('shipped ACME-4217, then UTF-8', TITLES), {
            text: 'shipped ACME-4217[Download times out], then UTF-8',
            ranges: [{start: 17, end: 37}],
        });
    });

    it('titles a ticket once, however often it is mentioned', () => {
        assert.equal(
            annotate('ACME-4217 again ACME-4217', TITLES).text,
            'ACME-4217[Download times out] again ACME-4217',
        );
    });

    it('leaves a ticket its writer already described', () => {
        assert.deepEqual(annotate('ACME-4217 (the Safari one)', TITLES), {
            text: 'ACME-4217 (the Safari one)',
            ranges: [],
        });
        assert.equal(
            annotate('ACME-4217[the Safari one]', TITLES).text,
            'ACME-4217[the Safari one]',
        );
    });

    it('shortens long titles', () => {
        assert.equal(
            annotate('OPS-7', TITLES).text,
            'OPS-7[Rotate the staging certificates before they exp…]',
        );
    });

    it("titles any module's references, like an issue number", () => {
        assert.equal(
            annotate('fixed #412 and #auth', new Map([['#412', {title: 'Crash on start'}]])).text,
            'fixed #412[Crash on start] and #auth',
        );
    });

    it("writes a title the way its module's template has it", () => {
        const spaced = new Map([
            ['ACME-4217', {title: 'Download times out', templates: {title: '{ref} ({title})'}}],
        ]);
        const before = new Map([
            ['ACME-4217', {title: 'Download times out', templates: {title: '{title}: {ref}'}}],
        ]);

        assert.deepEqual(annotate('shipped ACME-4217', spaced), {
            text: 'shipped ACME-4217 (Download times out)',
            ranges: [{start: 17, end: 38}],
        });
        // what comes before the reference is added before it
        assert.deepEqual(annotate('shipped ACME-4217', before), {
            text: 'shipped Download times out: ACME-4217',
            ranges: [{start: 8, end: 28}],
        });
    });

    it('counts in code points', () => {
        assert.deepEqual(annotate('🚀 ACME-4217', TITLES).ranges, [{start: 11, end: 31}]);
    });

    it('marks code, knowing nothing or something, where it ends up', () => {
        assert.deepEqual(annotate('run ``a`b``', new Map()), {
            text: 'run ``a`b``',
            ranges: [
                {start: 4, end: 6, code: 'fence'},
                {start: 6, end: 9, code: 'text'},
                {start: 9, end: 11, code: 'fence'},
            ],
        });
        assert.deepEqual(annotate('ACME-4217 in `ACME-4217`', TITLES), {
            text: 'ACME-4217[Download times out] in `ACME-4217`',
            ranges: [
                {start: 9, end: 29},
                {start: 33, end: 34, code: 'fence'},
                {start: 34, end: 43, code: 'text'},
                {start: 43, end: 44, code: 'fence'},
            ],
        });
    });

    it('titles nothing in code', () => {
        assert.equal(
            annotate('`ACME-4217` then ACME-4217', TITLES).text,
            '`ACME-4217` then ACME-4217[Download times out]',
        );
    });
});

describe('copy', () => {
    it('writes a title into the text at its first mention, as the copy template has it', () => {
        assert.equal(
            copy('shipped ACME-4217, and ACME-4217 again', TITLES),
            'shipped ACME-4217[Download times out], and ACME-4217 again',
        );
    });

    it('makes Markdown links, or whatever else the template says', () => {
        const linked = new Map([
            [
                'legacy#12',
                {
                    title: 'Fix login',
                    link: 'https://github.com/sovrin/sonotas/issues/12',
                    badge: {glyph: '✗'},
                    templates: {copy: '[{ref}]({link}) {title} {mark}'},
                },
            ],
        ]);

        assert.equal(
            copy('review legacy#12', linked),
            'review [legacy#12](https://github.com/sovrin/sonotas/issues/12) Fix login ✗',
        );
    });

    it('copies code as it was written', () => {
        assert.equal(
            copy('`ACME-4217` then ACME-4217', TITLES),
            '`ACME-4217` then ACME-4217[Download times out]',
        );
    });

    it('leaves a reference its writer described, and one it knows nothing about', () => {
        assert.equal(copy('ACME-4217 (mine) and UTF-8', TITLES), 'ACME-4217 (mine) and UTF-8');
    });
});

describe('clip', () => {
    it('keeps the notes within a part, counted from its start', () => {
        const ranges = [
            {start: 5, end: 15},
            {start: 20, end: 25},
        ];

        assert.deepEqual(clip(ranges, 10, 22), [
            {start: 0, end: 5},
            {start: 10, end: 12},
        ]);
        assert.deepEqual(clip(ranges, 15, 20), []);
        assert.deepEqual(clip(ranges, 3), [
            {start: 2, end: 12},
            {start: 17, end: 22},
        ]);
    });
});

describe('annotate with badges', () => {
    const KNOWN = new Map([
        ['legacy#12', {title: 'Fix login', badge: {glyph: '✓', color: 'green'}, marked: true}],
    ]);

    it('puts a mark after every mention, and the title after the first', () => {
        assert.deepEqual(annotate('legacy#12 and again legacy#12', KNOWN), {
            text: 'legacy#12 ✓[Fix login] and again legacy#12 ✓',
            ranges: [
                {start: 9, end: 11, badge: true, color: 'green'},
                {start: 11, end: 22},
                {start: 42, end: 44, badge: true, color: 'green'},
            ],
        });
    });

    it('draws no mark for a badge that is not marked, like one drawn as an underline', () => {
        const underlined = new Map([
            [
                'legacy#12',
                {title: 'Fix login', badge: {glyph: '✓', color: 'green'}, underline: 'green'},
            ],
        ]);

        assert.equal(annotate('legacy#12', underlined).text, 'legacy#12[Fix login]');
    });

    it("writes the mark the way its module's template has it", () => {
        const before = new Map([
            ['legacy#12', {badge: {glyph: '✓'}, marked: true, templates: {mark: '{mark} {ref}'}}],
        ]);

        assert.deepEqual(annotate('legacy#12', before), {
            text: '✓ legacy#12',
            ranges: [{start: 0, end: 2, badge: true}],
        });
    });

    it("strikes a dropped reference's title through with it", () => {
        const dropped = new Map([['legacy#12', {title: 'Fix login', settled: 'dropped' as const}]]);
        const done = new Map([['legacy#12', {title: 'Fix login', settled: 'done' as const}]]);

        assert.deepEqual(annotate('legacy#12', dropped).ranges, [
            {start: 9, end: 20, struck: true},
        ]);
        assert.deepEqual(annotate('legacy#12', done).ranges, [{start: 9, end: 20}]);
    });

    it('adds no title for a reference known without one', () => {
        const bare = new Map([['legacy#12', {badge: {glyph: '✓'}, marked: true}]]);

        assert.deepEqual(annotate('legacy#12', bare), {
            text: 'legacy#12 ✓',
            ranges: [{start: 9, end: 11, badge: true}],
        });
    });

    it('keeps the badge where the writer described the reference', () => {
        assert.equal(annotate('legacy#12 (mine)', KNOWN).text, 'legacy#12 ✓ (mine)');
    });
});

describe('clip with colours', () => {
    it('keeps what colour a note is drawn in', () => {
        assert.deepEqual(clip([{start: 2, end: 3, color: 'red'}], 1), [
            {start: 1, end: 2, color: 'red'},
        ]);
    });
});

const fresh = (answer: {status?: string} | null) => (answer?.status === 'running' ? 60_000 : FRESH);

describe('due', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');

    it('asks about references never asked about, or not for a week', () => {
        const asked = new Map([
            ['A-1', {at: '2026-09-23T12:00:00.000Z', answer: {title: 'x'}}],
            ['A-2', {at: new Date(now - FRESH - 1).toISOString(), answer: null}],
        ]);

        assert.deepEqual(due(['A-1', 'A-2', 'A-3'], asked, undefined, now), ['A-2', 'A-3']);
    });

    it('trusts an answer for as long as the module says', () => {
        const asked = new Map([
            [
                'a#1',
                {at: new Date(now - 90_000).toISOString(), answer: {title: 'x', status: 'running'}},
            ],
            [
                'a#2',
                {at: new Date(now - 90_000).toISOString(), answer: {title: 'y', status: 'merged'}},
            ],
        ]);
        assert.deepEqual(due(['a#1', 'a#2'], asked, fresh, now), ['a#1']);
    });
});
