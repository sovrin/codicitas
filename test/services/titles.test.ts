import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {annotate, clip, due, FRESH} from '#/services/titles';

const TITLES = new Map([
    ['ACME-4217', {title: 'Download times out'}],
    ['OPS-7', {title: 'Rotate the staging certificates before they expire next month'}],
]);

describe('annotate', () => {
    it('adds a title after each ticket it knows, saying where', () => {
        assert.deepEqual(annotate('shipped ACME-4217, then UTF-8', TITLES), {
            text: 'shipped ACME-4217 (Download times out), then UTF-8',
            notes: [{start: 17, end: 38}],
        });
    });

    it('titles a ticket once, however often it is mentioned', () => {
        assert.equal(
            annotate('ACME-4217 again ACME-4217', TITLES).text,
            'ACME-4217 (Download times out) again ACME-4217',
        );
    });

    it('leaves a ticket its writer already described', () => {
        assert.deepEqual(annotate('ACME-4217 (the Safari one)', TITLES), {
            text: 'ACME-4217 (the Safari one)',
            notes: [],
        });
    });

    it('shortens long titles', () => {
        assert.equal(
            annotate('OPS-7', TITLES).text,
            'OPS-7 (Rotate the staging certificates before they exp…)',
        );
    });

    it("titles any module's references, like an issue number", () => {
        assert.equal(
            annotate('fixed #412 and #auth', new Map([['#412', {title: 'Crash on start'}]])).text,
            'fixed #412 (Crash on start) and #auth',
        );
    });

    it('counts in code points', () => {
        assert.deepEqual(annotate('🚀 ACME-4217', TITLES).notes, [{start: 11, end: 32}]);
    });
});

describe('clip', () => {
    it('keeps the notes within a part, counted from its start', () => {
        const notes = [
            {start: 5, end: 15},
            {start: 20, end: 25},
        ];

        assert.deepEqual(clip(notes, 10, 22), [
            {start: 0, end: 5},
            {start: 10, end: 12},
        ]);
        assert.deepEqual(clip(notes, 15, 20), []);
        assert.deepEqual(clip(notes, 3), [
            {start: 2, end: 12},
            {start: 17, end: 22},
        ]);
    });
});

describe('annotate with badges', () => {
    const KNOWN = new Map([
        ['legacy#12', {title: 'Fix login', badge: {glyph: '✓', color: 'green'}}],
    ]);

    it('puts a badge before every mention, and the title after the first', () => {
        assert.deepEqual(annotate('legacy#12 and again legacy#12', KNOWN), {
            text: '✓legacy#12 (Fix login) and again ✓legacy#12',
            notes: [
                {start: 0, end: 1, badge: true, color: 'green'},
                {start: 10, end: 22},
                {start: 33, end: 34, badge: true, color: 'green'},
            ],
        });
    });

    it('draws a title in the colour it comes with', () => {
        const merged = new Map([['legacy#12', {title: 'Fix login', color: 'magenta'}]]);

        assert.deepEqual(annotate('legacy#12', merged).notes, [
            {start: 9, end: 21, color: 'magenta'},
        ]);
    });

    it('adds no title for a reference known without one', () => {
        const bare = new Map([['legacy#12', {badge: {glyph: '✓'}}]]);

        assert.deepEqual(annotate('legacy#12', bare), {
            text: '✓legacy#12',
            notes: [{start: 0, end: 1, badge: true}],
        });
    });

    it('keeps the badge where the writer described the reference', () => {
        assert.equal(annotate('legacy#12 (mine)', KNOWN).text, '✓legacy#12 (mine)');
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
