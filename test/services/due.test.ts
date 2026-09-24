import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {backlog, dueOf, isPressing, leadOf} from '#/services/due';
import type {Entry} from '#/services/journal';
import {daysBetween, resolveDue} from '#/utils';

// a Thursday
const TODAY = '2026-09-24';

const todo = (due?: string) => ({tag: 'todo' as const, ...(due ? {due} : {})});

const entry = (id: number, fields: Partial<Entry>): Entry => ({
    id,
    time: '09:00',
    tag: 'todo',
    text: String(id),
    ...fields,
});

describe('resolveDue', () => {
    it('takes a weekday by its name or the start of it, next week on the day itself', () => {
        assert.equal(resolveDue('fri', TODAY), '2026-09-25');
        assert.equal(resolveDue('friday', TODAY), '2026-09-25');
        assert.equal(resolveDue('f', TODAY), '2026-09-25');
        assert.equal(resolveDue('FRI', TODAY), '2026-09-25');
        assert.equal(resolveDue('thu', TODAY), '2026-10-01');
        assert.equal(resolveDue('wed', TODAY), '2026-09-30');
        assert.equal(resolveDue('tu', TODAY), '2026-09-29');
    });

    it('takes today and tomorrow, but not a start that could be either', () => {
        assert.equal(resolveDue('today', TODAY), TODAY);
        assert.equal(resolveDue('tod', TODAY), TODAY);
        assert.equal(resolveDue('tom', TODAY), '2026-09-25');
        assert.equal(resolveDue('t', TODAY), undefined);
        assert.equal(resolveDue('to', TODAY), undefined);
        assert.equal(resolveDue('s', TODAY), undefined);
    });

    it('counts days and weeks from today', () => {
        assert.equal(resolveDue('0d', TODAY), TODAY);
        assert.equal(resolveDue('3d', TODAY), '2026-09-27');
        assert.equal(resolveDue('2w', TODAY), '2026-10-08');
    });

    it('takes a date in whichever year comes next, the month either side', () => {
        assert.equal(resolveDue('2oct', TODAY), '2026-10-02');
        assert.equal(resolveDue('oct2', TODAY), '2026-10-02');
        assert.equal(resolveDue('24sept', TODAY), TODAY);
        assert.equal(resolveDue('1sep', TODAY), '2027-09-01');
        assert.equal(resolveDue('29feb', TODAY), '2028-02-29');
        assert.equal(resolveDue('2026-10-02', TODAY), '2026-10-02');
    });

    it('names no day for what is not one', () => {
        for (const word of ['31feb', '2026-02-30', '2ma', 'soon', '=', '12', '']) {
            assert.equal(resolveDue(word, TODAY), undefined, word);
        }
    });

    it('counts days between two days, either way', () => {
        assert.equal(daysBetween(TODAY, '2026-10-01'), 7);
        assert.equal(daysBetween(TODAY, '2026-09-21'), -3);
        // across the end of summer time
        assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
    });
});

describe('dueOf', () => {
    it('says the day by name within the week, by date beyond it', () => {
        assert.deepEqual(dueOf(todo(TODAY), TODAY), {label: 'due today', urgency: 'today'});
        assert.deepEqual(dueOf(todo('2026-09-25'), TODAY), {
            label: 'due tomorrow',
            urgency: 'ahead',
        });
        assert.equal(dueOf(todo('2026-09-29'), TODAY).label, 'due tue');
        assert.equal(dueOf(todo('2026-10-01'), TODAY).label, 'due 1 Oct');
    });

    it('says how long ago a date passed', () => {
        assert.deepEqual(dueOf(todo('2026-09-21'), TODAY), {
            label: '3d overdue',
            urgency: 'late',
        });
    });

    it('is only there for a todo still open', () => {
        assert.equal(dueOf(todo(), TODAY), undefined);
        assert.equal(dueOf({tag: 'done', due: '2026-09-21'}, TODAY), undefined);
        assert.equal(leadOf(undefined), '');
        assert.equal(leadOf(dueOf(todo(TODAY), TODAY)), 'due today · ');
    });

    it('presses once due, not before', () => {
        assert.equal(isPressing(todo(TODAY), TODAY), true);
        assert.equal(isPressing(todo('2026-09-01'), TODAY), true);
        assert.equal(isPressing(todo('2026-09-25'), TODAY), false);
        assert.equal(isPressing(todo(), TODAY), false);
    });
});

describe('backlog', () => {
    it('puts what is due first, longest overdue leading, then by priority and date', () => {
        const todos = [
            entry(1, {}),
            entry(2, {priority: 4}),
            entry(3, {due: '2026-10-05'}),
            entry(4, {due: TODAY, priority: 1}),
            entry(5, {due: '2026-09-20'}),
            entry(6, {due: '2026-09-28'}),
            entry(7, {priority: 4, due: '2026-12-01'}),
        ];

        assert.deepEqual(
            backlog(todos, TODAY).map(({id}) => id),
            [5, 4, 7, 2, 6, 3, 1],
        );
    });
});
