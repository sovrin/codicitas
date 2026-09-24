import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {draft} from '#/services/editor';
import type {Entry} from '#/services/journal';
import {focusOf, layout, type Row, viewport} from '#/services/timeline';

const ENTRIES: Entry[] = [
    {id: 1, time: '09:05', tag: 'meet', text: 'standup'},
    {id: 2, time: '09:40', tag: 'todo', text: 'review the retry logic before release'},
    {id: 3, time: '11:15', tag: 'done', text: 'fixed flaky login test'},
];

const kinds = (gap: number) =>
    layout({entries: ENTRIES, width: 80, gap}).filter(({kind}) => kind === 'gap').length;

const describeRow = (row: Row): string => {
    switch (row.kind) {
        case 'gap':
            return `gap ${row.label ?? ''}`.trim();

        case 'now':
            return `now ${row.time}`;

        case 'entry':
            return `${row.isFirst ? row.time : '     '} ${row.tag} ${row.text}`;

        case 'draft':
            return `draft ${row.tag} ${row.text}${row.cursor === undefined ? '' : ` @${row.cursor}`}`;
    }
};

describe('layout', () => {
    it('spells out a stretch of half an hour or more, and nothing shorter', () => {
        assert.deepEqual(layout({entries: ENTRIES, width: 80}).map(describeRow), [
            '09:05 meet standup',
            'gap',
            'gap 35m',
            'gap',
            '09:40 todo review the retry logic before release',
            'gap',
            'gap 1h 35m',
            'gap',
            '11:15 done fixed flaky login test',
        ]);
    });

    it('wraps an entry under its own text', () => {
        const rows = layout({entries: [ENTRIES[1]], width: 20}).map(describeRow);

        assert.deepEqual(rows, ['09:40 todo review the retry ', '      todo logic before release']);
    });

    it('runs on to now on today, naming the quiet since the last entry', () => {
        const rows = layout({entries: ENTRIES, width: 80, now: '12:02'}).map(describeRow);

        assert.deepEqual(rows.slice(-4), ['gap', 'gap 47m quiet', 'gap', 'now 12:02']);
    });

    it('goes straight to now after a short pause', () => {
        assert.deepEqual(
            layout({entries: ENTRIES, width: 80, now: '11:20'}).map(describeRow).slice(-2),
            ['11:15 done fixed flaky login test', 'now 11:20'],
        );
    });

    it('writes a new entry where now was', () => {
        const rows = layout({
            entries: ENTRIES.slice(2),
            width: 80,
            now: '11:20',
            composing: {draft: draft('ask ops'), tag: 'todo'},
        }).map(describeRow);

        assert.deepEqual(rows, ['11:15 done fixed flaky login test', 'draft todo ask ops @7']);
    });

    it('edits an entry in its place, keeping its time', () => {
        const rows = layout({
            entries: ENTRIES,
            width: 80,
            composing: {draft: draft('standup, then auth'), tag: 'meet', index: 0},
        });

        assert.deepEqual(rows[0], {
            kind: 'draft',
            time: '09:05',
            tag: 'meet',
            text: 'standup, then auth',
            isFirst: true,
            cursor: 18,
        });
    });

    it('shows no gap before an entry written after the fact with an earlier time', () => {
        const rows = layout({entries: [ENTRIES[2], ENTRIES[0]], width: 80});

        assert.equal(
            rows.some(({kind}) => kind === 'gap'),
            false,
        );
    });
});

describe('viewport', () => {
    it('keeps the end of the day in view while the focus is in it', () => {
        assert.equal(viewport(30, 25, 10), 20);
        assert.equal(viewport(8, 3, 10), 0);
    });

    it('pins the focus to the top above that', () => {
        assert.equal(viewport(30, 4, 10), 4);
    });
});

describe('focusOf', () => {
    it('follows the cursor while writing, the selected entry otherwise', () => {
        const rows = layout({entries: ENTRIES, width: 80, now: '12:00'});

        assert.equal(focusOf(rows, 2), 8);

        const writing = layout({
            entries: ENTRIES,
            width: 80,
            now: '12:00',
            composing: {draft: draft('x'), tag: 'note'},
        });

        assert.equal(writing[focusOf(writing, 2)].kind, 'draft');
    });
});

describe('layout settings', () => {
    it('draws breaks from the chosen length, or none at all', () => {
        assert.equal(kinds(30), 6);
        assert.equal(kinds(60), 3);
        assert.equal(kinds(0), 0);
    });

    it('leaves the quiet before now out when asked, keeping now', () => {
        const rows = layout({entries: ENTRIES, width: 80, now: '13:00', quiet: false}).map(
            describeRow,
        );

        assert.deepEqual(rows.slice(-2), ['11:15 done fixed flaky login test', 'now 13:00']);
    });
});

describe('writing with a time', () => {
    it('shows the @time being typed in place of now', () => {
        const rows = layout({
            entries: ENTRIES.slice(2),
            width: 80,
            now: '11:20',
            composing: {draft: draft('@10:00 ask ops'), tag: 'note', time: '10:00'},
        });

        const last = rows.at(-1);

        assert.equal(last.kind === 'draft' && last.time, '10:00');
    });
});

describe('priority marks', () => {
    it('puts !! in front of a critical todo, wrapping with it', () => {
        const rows = layout({
            entries: [
                {
                    id: 1,
                    time: '09:00',
                    tag: 'todo',
                    text: 'hotfix the payment webhook',
                    priority: 4,
                },
            ],
            width: 16,
        });

        assert.deepEqual(
            rows.map((row) => row.kind === 'entry' && [row.text, row.mark]),
            [
                ['!! hotfix the ', '!! '],
                ['payment webhook', ''],
            ],
        );
    });
});

describe('layout with ticket titles', () => {
    it('wraps a title with the text, and says on which rows it is', () => {
        const rows = layout({
            entries: [{id: 1, time: '09:00', tag: 'done', text: 'shipped ACME-4217 today'}],
            width: 30,
            titles: new Map([['ACME-4217', {title: 'Download times out'}]]),
        }).filter((row) => row.kind === 'entry');

        assert.deepEqual(
            rows.map((row) => row.kind === 'entry' && [row.text, row.notes]),
            [
                ['shipped ACME-4217[Download ', [{start: 17, end: 27}]],
                ['times out] today', [{start: 0, end: 10}]],
            ],
        );
    });
});
