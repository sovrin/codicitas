import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {after, before, describe, it} from 'node:test';
import {command, USAGE} from '#/commands';
import * as store from '#/services/store';
import {toKey} from '#/utils';
import {version} from '#/const';

describe('command', () => {
    let root: string;

    before(() => {
        root = mkdtempSync(join(tmpdir(), 'codicitas-'));
        process.env.CODICITAS_DIR = root;
    });

    after(() => {
        store.close();
        delete process.env.CODICITAS_DIR;
        rmSync(root, {recursive: true, force: true});
    });

    it('opens the journal when there is no command', async () => {
        assert.equal(await command([]), undefined);
    });

    it('adds an entry to today, tag and all', async () => {
        const result = await command(['add', '/done', 'shipped', 'the', 'importer']);

        assert.match(result.text, /^added done at \d\d:\d\d: shipped the importer$/);
        assert.equal(result.code, 0);
        assert.deepEqual(
            store.load(toKey()).map(({tag, text}) => [tag, text]),
            [['done', 'shipped the importer']],
        );
    });

    it('reads stdin in place of a dash', async () => {
        const result = await command(
            ['add', '/todo', '-'],
            async () => 'write the migration guide\n',
        );

        assert.equal(result.code, 0);
        assert.equal(store.load(toKey()).at(-1).text, 'write the migration guide');
    });

    it('does not read stdin unless asked to', async () => {
        await command(['add', 'plain'], async () => assert.fail('stdin was read'));
    });

    it('tags an entry without a /tag as the settings say', async () => {
        store.saveSetting('tag', 'todo');

        await command(['add', 'ping ops']);
        assert.equal(store.load(toKey()).at(-1).tag, 'todo');

        store.saveSetting('tag', 'note');
    });

    it('dates an entry with @time', async () => {
        const result = await command(['add', '@7:45', '/done', 'early deploy']);

        assert.equal(result.text, 'added done at 07:45: early deploy');
        assert.equal(store.load(toKey())[0].time, '07:45');
    });

    it('takes a 12 hour time, and answers in the clock the settings say', async () => {
        store.saveSetting('clock', '12h');

        const result = await command(['add', '@9:30pm', 'late deploy']);

        assert.equal(result.text, 'added note at 9:30pm: late deploy');
        // found by its text: entries added at now sort after it once it is past 21:30
        assert.equal(store.load(toKey()).find(({text}) => text === 'late deploy').time, '21:30');

        store.saveSetting('clock', '24h');
    });

    it('makes a todo due with >day, and says when', async () => {
        const result = await command(['add', '/todo', '>tom', '@8:00', 'call the bank']);

        assert.equal(result.text, 'added todo at 08:00, due tomorrow: call the bank');
        assert.equal(
            store.load(toKey()).find(({text}) => text === 'call the bank').due > toKey(),
            true,
        );
    });

    it('refuses to add nothing', async () => {
        assert.equal((await command(['add'])).code, 2);
        assert.equal((await command(['add', '/done'])).code, 2);
    });

    it('answers help and version', async () => {
        assert.deepEqual(await command(['--help']), {text: USAGE, code: 0});
        assert.deepEqual(await command(['-v']), {text: version, code: 0});
    });

    it('rejects an unknown command or flag with the usage', async () => {
        const unknown = await command(['nope']);
        const flag = await command(['--nope']);

        assert.equal(unknown.code, 2);
        assert.match(unknown.text, /unknown command: nope[\s\S]*usage: codi/);
        assert.equal(flag.code, 2);
    });
});
