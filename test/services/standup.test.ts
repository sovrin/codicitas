import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {standup, toText} from '#/services/standup';
import type {Found} from '#/services/store';

const DAY = '2026-09-24';

const RECENT: Found[] = [
    {
        id: 1,
        day: DAY,
        time: '09:00',
        tag: 'done',
        text: 'fixed flaky login test\nroot cause: shared mock',
    },
    {id: 2, day: DAY, time: '10:00', tag: 'note', text: 'coffee'},
    {id: 3, day: DAY, time: '11:00', tag: 'todo', text: 'review PR #412'},
    {id: 4, day: DAY, time: '12:00', tag: 'done', text: 'deployed'},
];

const OPEN: Found[] = [
    {id: 0, day: '2026-09-10', time: '15:00', tag: 'todo', text: 'update the runbook'},
    RECENT[2],
];

describe('standup', () => {
    it('takes done and blocked from the recent days and next from every open todo', () => {
        const sections = standup(RECENT, OPEN);

        assert.deepEqual(
            sections.map(({title, entries}) => [title, entries.map(({id}) => id)]),
            [
                ['done', [1, 4]],
                ['next', [0, 3]],
                ['blocked', []],
            ],
        );
    });
});

describe('toText with priorities', () => {
    it('keeps the marks of urgent todos', () => {
        const next = [
            {
                id: 9,
                day: DAY,
                time: '09:00',
                tag: 'todo' as const,
                text: 'hotfix prod',
                priority: 4 as const,
            },
        ];

        assert.match(toText(standup([], next)), /Next\n- !! hotfix prod/);
    });
});

describe('toText with due dates', () => {
    it("says a todo's due date after its first line", () => {
        const next: Found[] = [
            {
                id: 9,
                day: DAY,
                time: '09:00',
                tag: 'todo',
                text: 'send the report\nwith the numbers',
                due: '2026-09-25',
            },
            {id: 10, day: DAY, time: '09:00', tag: 'todo', text: 'renew', due: '2026-09-20'},
        ];

        assert.match(
            toText(standup([], next), new Map(), DAY),
            /Next\n- send the report \(due tomorrow\)\n  with the numbers\n- renew \(4d overdue\)/,
        );
    });
});

describe('toText', () => {
    it('writes one bullet per entry, continuation lines indented, empty sections said so', () => {
        assert.equal(
            toText(standup(RECENT, OPEN.slice(1))),
            [
                'Done',
                '- fixed flaky login test',
                '  root cause: shared mock',
                '- deployed',
                '',
                'Next',
                '- review PR #412',
                '',
                'Blocked',
                '- nothing',
            ].join('\n'),
        );
    });
});

describe('toText with ticket titles', () => {
    it("takes each ticket's title along", () => {
        const done = [
            {id: 9, day: DAY, time: '09:00', tag: 'done' as const, text: 'shipped ACME-4217'},
        ];

        assert.match(
            toText(standup(done, []), new Map([['ACME-4217', {title: 'Download times out'}]])),
            /Done\n- shipped ACME-4217\[Download times out\]/,
        );
    });
});
