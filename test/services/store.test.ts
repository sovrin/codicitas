import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {after, before, describe, it} from 'node:test';
import {
    add,
    asked,
    close,
    days,
    get,
    known,
    load,
    loadSettings,
    move,
    openTodos,
    path,
    previousDay,
    remove,
    restore,
    saveSetting,
    saveTitle,
    search,
    tickets,
    titles,
    update,
} from '#/services/store';

describe('store', () => {
    let root: string;

    before(() => {
        root = mkdtempSync(join(tmpdir(), 'codicitas-'));
        process.env.CODICITAS_DIR = root;
    });

    after(() => {
        close();
        delete process.env.CODICITAS_DIR;
        rmSync(root, {recursive: true, force: true});
    });

    it('keeps one database file where it is told to', () => {
        assert.equal(path(), join(root, 'journal.db'));
        assert.deepEqual(load('2026-01-01'), []);
        assert.equal(existsSync(path()), true);
    });

    it('stores entries per day, in the order they were written', () => {
        const first = add('2026-09-24', {
            time: '09:00',
            tag: 'done',
            text: 'deployed\nno rollback needed',
        });
        const second = add('2026-09-24', {
            time: '10:00',
            tag: 'todo',
            text: 'write the postmortem',
        });

        add('2026-09-23', {time: '17:00', tag: 'note', text: 'yesterday'});

        assert.deepEqual(load('2026-09-24'), [
            {id: first, time: '09:00', tag: 'done', text: 'deployed\nno rollback needed'},
            {id: second, time: '10:00', tag: 'todo', text: 'write the postmortem'},
        ]);
    });

    it('lists days with entries, newest first', () => {
        assert.deepEqual(days(), ['2026-09-24', '2026-09-23']);
    });

    it('updates and removes by id', () => {
        const [first, second] = load('2026-09-24');

        update(second.id, {tag: 'done', text: 'wrote the postmortem'});
        remove(first.id);

        assert.deepEqual(load('2026-09-24'), [
            {...second, tag: 'done', text: 'wrote the postmortem'},
        ]);
    });

    it('drops a day from the list once its last entry is gone', () => {
        const [only] = load('2026-09-23');

        remove(only.id);

        assert.deepEqual(days(), ['2026-09-24']);
    });

    it('finds the last day with entries before another', () => {
        add('2026-09-18', {time: '09:00', tag: 'note', text: 'friday'});

        assert.equal(previousDay('2026-09-24'), '2026-09-18');
        assert.equal(previousDay('2026-09-18'), undefined);
    });

    it('searches every day for entries holding all terms, newest first', () => {
        add('2026-09-25', {time: '09:00', tag: 'todo', text: 'Review the Postmortem draft'});

        assert.deepEqual(
            search(['postmortem']).map(({day, text}) => [day, text]),
            [
                ['2026-09-25', 'Review the Postmortem draft'],
                ['2026-09-24', 'wrote the postmortem'],
            ],
        );
        assert.deepEqual(
            search(['postmortem', 'draft']).map(({day}) => day),
            ['2026-09-25'],
        );
    });

    it('narrows by tag, with or without words', () => {
        assert.deepEqual(
            search([], 'todo').map(({day}) => day),
            ['2026-09-25'],
        );
        assert.deepEqual(
            search(['postmortem'], 'done').map(({day}) => day),
            ['2026-09-24'],
        );
    });

    it('takes % and _ literally', () => {
        add('2026-09-25', {time: '10:00', tag: 'note', text: 'coverage at 80%'});

        assert.equal(search(['0%']).length, 1);
        assert.equal(search(['%']).length, 1);
        assert.equal(search(['_']).length, 0);
    });

    it('lists open todos from every day, oldest first', () => {
        add('2026-09-01', {time: '09:00', tag: 'todo', text: 'the oldest'});

        assert.deepEqual(
            openTodos().map(({day, text}) => [day, text]),
            [
                ['2026-09-01', 'the oldest'],
                ['2026-09-25', 'Review the Postmortem draft'],
            ],
        );
    });

    it('puts a removed entry back exactly as it was', () => {
        const [entry] = load('2026-09-01');
        const row = get(entry.id);

        remove(entry.id);
        assert.equal(get(entry.id), undefined);

        restore(row);
        assert.deepEqual(get(entry.id), row);
        assert.match(row.createdAt, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('orders a day by time, so a late entry lands where it happened', () => {
        const late = add('2026-08-01', {time: '15:00', tag: 'note', text: 'afternoon'});

        add('2026-08-01', {time: '09:00', tag: 'note', text: 'morning, written later'});
        assert.deepEqual(
            load('2026-08-01').map(({text}) => text),
            ['morning, written later', 'afternoon'],
        );

        update(late, {tag: 'note', text: 'early after all', time: '08:00'});
        assert.deepEqual(
            load('2026-08-01').map(({time, text}) => [time, text]),
            [
                ['08:00', 'early after all'],
                ['09:00', 'morning, written later'],
            ],
        );
    });

    it('moves an entry to another day, time and all', () => {
        const [first] = load('2026-08-01');

        move(first.id, '2026-08-02');
        assert.deepEqual(load('2026-08-02'), [first]);
        assert.equal(load('2026-08-01').length, 1);
    });

    it('keeps an index of who and what entries mention, in step with every write', () => {
        const first = add('2026-07-01', {
            time: '09:00',
            tag: 'meet',
            text: '1:1 with @anna about #auth',
        });
        const second = add('2026-07-02', {
            time: '10:00',
            tag: 'done',
            text: 'paired with @Anna and @bo',
        });

        assert.deepEqual(known('person'), ['@Anna', '@bo']);
        assert.deepEqual(
            known('topic').filter((name) => name === '#auth'),
            ['#auth'],
        );

        update(second, {tag: 'done', text: 'paired with @bo'});
        assert.deepEqual(known('person'), ['@bo', '@anna']);

        const row = get(first);

        remove(first);
        assert.deepEqual(known('person'), ['@bo']);

        restore(row);
        move(first, '2026-07-03');
        assert.deepEqual(known('person'), ['@anna', '@bo']);
    });

    it('ranks the most used first, the most recent among equals', () => {
        add('2026-07-04', {time: '09:00', tag: 'note', text: '@bo again'});

        assert.deepEqual(known('person'), ['@bo', '@anna']);
    });

    it('keeps a priority only where one was chosen', () => {
        const plain = add('2026-06-01', {time: '09:00', tag: 'todo', text: 'plain'});
        const urgent = add('2026-06-01', {time: '09:05', tag: 'todo', text: 'urgent', priority: 4});

        assert.deepEqual(
            load('2026-06-01').map(({id, priority}) => [id, priority]),
            [
                [plain, undefined],
                [urgent, 4],
            ],
        );
        assert.equal('priority' in load('2026-06-01')[0], false);

        // left alone unless given, taken away with null
        update(urgent, {tag: 'todo', text: 'urgent, reworded'});
        assert.equal(get(urgent).priority, 4);
        update(urgent, {tag: 'todo', text: 'urgent, reworded', priority: null});
        assert.equal(get(urgent).priority, undefined);
        update(urgent, {tag: 'todo', text: 'urgent, reworded', priority: 3});

        const row = get(urgent);

        remove(urgent);
        restore(row);
        assert.equal(get(urgent).priority, 3);
    });

    it('lists open todos by priority first, oldest first within one', () => {
        const open = openTodos()
            .filter(({day}) => day === '2026-06-01' || day === '2026-09-01')
            .map(({text}) => text);

        // plain was written in June, "the oldest" in September
        assert.deepEqual(open, ['urgent, reworded', 'plain', 'the oldest']);
    });

    it('narrows a search by priority, no priority counting as mid', () => {
        assert.deepEqual(
            search([], 'todo', 3).map(({text}) => text),
            ['urgent, reworded'],
        );
        assert.ok(search([], 'todo', 2).some(({text}) => text === 'plain'));
    });

    it('keeps settings as JSON, overwriting on change', () => {
        saveSetting('gap', 45);
        saveSetting('quiet', false);
        saveSetting('gap', 60);

        assert.deepEqual(loadSettings(), {gap: 60, quiet: false});
    });

    it('lists the tickets mentioned, apart from other topics', () => {
        add('2026-09-25', {time: '09:00', tag: 'done', text: 'ACME-4217 and #auth, then ACME-7'});

        assert.deepEqual(
            tickets()
                .filter((key) => key.startsWith('ACME'))
                .toSorted(),
            ['ACME-4217', 'ACME-7'],
        );
        assert.ok(!tickets().includes('#auth'));
    });

    it('keeps what Jira said about a ticket per site, unknown tickets included', () => {
        saveTitle('https://acme.atlassian.net', 'ACME-4217', 'Download times out');
        saveTitle('https://acme.atlassian.net', 'UTF-8', null);
        saveTitle('https://other.example', 'ACME-4217', 'Something else entirely');

        assert.deepEqual(
            [...titles('https://acme.atlassian.net')],
            [['ACME-4217', 'Download times out']],
        );
        assert.deepEqual([...asked('https://acme.atlassian.net').keys()].toSorted(), [
            'ACME-4217',
            'UTF-8',
        ]);

        saveTitle('https://acme.atlassian.net', 'ACME-4217', 'Download times out on Safari');
        assert.equal(
            titles('https://acme.atlassian.net').get('ACME-4217'),
            'Download times out on Safari',
        );
    });

    it('records how far the schema has migrated', () => {
        const db = new DatabaseSync(path(), {readOnly: true});

        assert.deepEqual({...db.prepare('PRAGMA user_version').get()}, {user_version: 5});
        db.close();
    });

    it('upgrades a database from before settings, keeping its entries', () => {
        close();

        const old = join(root, 'old');

        process.env.CODICITAS_DIR = old;
        mkdirSync(old);

        const db = new DatabaseSync(join(old, 'journal.db'));

        db.exec(`CREATE TABLE entries (id INTEGER PRIMARY KEY, day TEXT NOT NULL, time TEXT NOT NULL, tag TEXT NOT NULL, text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
            CREATE INDEX entries_day ON entries (day, id);
            INSERT INTO entries (day, time, tag, text) VALUES ('2026-09-01', '09:00', 'done', 'written before settings, with @carla');
            PRAGMA user_version = 1;`);
        db.close();

        assert.deepEqual(
            load('2026-09-01').map(({text}) => text),
            ['written before settings, with @carla'],
        );
        assert.deepEqual(loadSettings(), {});
        // the mentions index is filled from what was already written
        assert.deepEqual(known('person'), ['@carla']);

        close();
        process.env.CODICITAS_DIR = root;
    });
});
