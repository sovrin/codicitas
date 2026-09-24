import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {annotate, clip, due, FRESH} from '#/services/tickets';

const TITLES = new Map([
    ['ACME-4217', 'Download times out'],
    ['OPS-7', 'Rotate the staging certificates before they expire next month'],
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

describe('due', () => {
    it('asks about tickets never asked about, or not for a week', () => {
        const now = Date.parse('2026-09-24T12:00:00Z');
        const asked = new Map([
            ['A-1', '2026-09-23T12:00:00.000Z'],
            ['A-2', new Date(now - FRESH - 1).toISOString()],
        ]);

        assert.deepEqual(due(['A-1', 'A-2', 'A-3'], asked, now), ['A-2', 'A-3']);
    });
});
