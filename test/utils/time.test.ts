import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    formatTime,
    quote,
    shiftDay,
    spaced,
    timeWidth,
    toDuration,
    toHeadline,
    toMinutes,
    weekOf,
} from '#/utils';

describe('time', () => {
    it('names a day in full, the year only when it is not this one', () => {
        assert.equal(toHeadline('2026-09-24', '2026-09-24'), 'Thursday 24 September');
        assert.equal(toHeadline('2025-12-31', '2026-09-24'), 'Wednesday 31 December 2025');
    });

    it('finds the Monday to Sunday week, across a month end', () => {
        assert.deepEqual(weekOf('2026-10-01'), [
            '2026-09-28',
            '2026-09-29',
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
            '2026-10-03',
            '2026-10-04',
        ]);
        assert.equal(weekOf('2026-09-27')[0], '2026-09-21');
        assert.equal(weekOf('2026-09-24', 'sunday')[0], '2026-09-20');
        assert.equal(weekOf('2026-09-27', 'sunday')[0], '2026-09-27');
    });

    it('says a stretch of time the way it is spoken', () => {
        assert.equal(toDuration(47), '47m');
        assert.equal(toDuration(95), '1h 35m');
        assert.equal(toDuration(180), '3h');
        assert.equal(toMinutes('09:40'), 580);
    });

    it('steps calendar days across month and year ends', () => {
        assert.equal(shiftDay('2026-10-01', -1), '2026-09-30');
        assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
    });

    it('shows a stored time on either clock, padded to line up', () => {
        assert.equal(formatTime('22:30', '24h'), '22:30');
        assert.equal(formatTime('22:30', '12h'), '10:30pm');
        assert.equal(formatTime('09:05', '12h'), ' 9:05am');
        assert.equal(formatTime('00:15', '12h'), '12:15am');
        assert.equal(formatTime('12:00', '12h'), '12:00pm');
        assert.equal(formatTime('09:05', '12h').length, timeWidth('12h'));
    });

    it('quotes the first line, cut with an ellipsis only where it has to be', () => {
        assert.equal(quote('short\nsecond line', 20), 'short');
        assert.equal(quote('asked @nikhil about his project', 16), 'asked @nikhil a…');
        assert.equal(quote('asked @nikhil about his project', 15), 'asked @nikhil…');
        assert.equal([...quote('x'.repeat(50), 10)].length, 10);
    });

    it('letter spaces a heading', () => {
        assert.equal(spaced('done'), 'D O N E');
    });
});
