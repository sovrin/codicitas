import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, it} from 'node:test';
import React from 'react';
import chalk from 'chalk';
import {cleanup, render} from 'ink-testing-library';
import {App} from '#/components';
import * as store from '#/services/store';

const TODAY = '2026-09-24';

// colons too, as in the colour of an underline: 58:5:1
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;:?]*[a-zA-Z]', 'g');

/**
 * Links, OSC 8: the address, then the text shown, then an empty link.
 */
const LINK = new RegExp(
    String.fromCharCode(27) + '\\]8;;[^' + String.fromCharCode(7) + ']*' + String.fromCharCode(7),
    'g',
);

const plain = (frame?: string): string => (frame ?? '').replace(ANSI, '').replace(LINK, '');

/**
 * Keys are read in an effect, so each write needs a turn of the loop before
 * the next frame reflects it.
 *
 * @param stdin
 * @param keys
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const repositories = () => store.loadSettings().githubRepositories;

const ESCAPE = String.fromCharCode(27);

const RED = '31';

/**
 * The foreground colour in effect where a text starts in a frame drawn with
 * colours on, as its code: 31 for red; undefined for the default.
 *
 * @param frame
 * @param text
 */
const colourAt = (frame: string, text: string): string | undefined => {
    const colour = frame
        .slice(0, frame.indexOf(text))
        .split(`${ESCAPE}[`)
        .slice(1)
        .flatMap((code) => code.slice(0, code.indexOf('m')).split(';'))
        .findLast((code) => /^3\d$/.test(code));

    return colour === '39' ? undefined : colour;
};

const pull = (state: string, checks?: string) => ({
    __typename: 'PullRequest',
    title: {OPEN: 'Fix login', MERGED: 'Drop cookies', CLOSED: 'Try another way'}[state],
    state,
    commits: {nodes: [{commit: {statusCheckRollup: checks ? {state: checks} : null}}]},
});
// 12 is open with failing checks, 13 merged, 14 closed without merging
const PULLS: Record<number, unknown> = {
    12: pull('OPEN', 'FAILURE'),
    13: pull('MERGED'),
    14: pull('CLOSED'),
};

const DIM = ['2', '22'];

const STRUCK = ['9', '29'];

/**
 * Whether a style is on where a text starts in a frame drawn with colours
 * on, by the codes that turn it on and off.
 *
 * @param frame
 * @param text
 * @param codes
 */
const styleAt = (frame: string, text: string, [on, off]: string[]): boolean =>
    frame
        .slice(0, frame.indexOf(text))
        .split(`${ESCAPE}[`)
        .slice(1)
        .flatMap((code) => code.slice(0, code.indexOf('m')).split(';'))
        .findLast((code) => code === on || code === off) === on;

/**
 * Waits until the check holds, for what arrives after a round trip or two -
 * an answer asked for once something is on screen - rather than a fixed time.
 *
 * @param check
 */
const until = async (check: () => boolean) => {
    for (let waited = 0; !check() && waited < 2000; waited += 20) {
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
};

const type = async (stdin: {write: (data: string) => void}, ...keys: string[]) => {
    for (const key of keys) {
        stdin.write(key);
        // keys arrive one after the other, like typing
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
};

/**
 * How wide the app thinks the terminal is. The tests have none, so it falls
 * back to 80; ink-testing-library draws 100 wide.
 *
 * @param columns
 */
const resize = (columns?: number) => {
    Object.defineProperty(process.stdout, 'columns', {value: columns, configurable: true});
};

describe('App', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'codicitas-'));
        process.env.CODICITAS_DIR = root;
    });

    afterEach(() => {
        // a failed assertion skips the test's own unmount, and a mounted app
        // keeps reading stdin, which would hang the whole run
        cleanup();
        store.close();
        resize(undefined);
        delete process.env.CODICITAS_DIR;
        rmSync(root, {recursive: true, force: true});
    });

    it('opens on today, the rail ending at now with an invitation to write', () => {
        resize(100);

        const {lastFrame, unmount} = render(<App today={TODAY} />);
        const frame = plain(lastFrame());

        assert.match(frame, /Thursday 24 September\s+mon tue wed thu fri sat sun/);
        assert.match(frame, /nothing written yet\s+·   ·   ·   ◉   ·   ·   ·/);

        const [names, marks] = frame.split('\n').filter((line) => /mon|◉/.test(line));
        const middles = [...names.matchAll(/[a-z]{3}(?= |$)/g)]
            .slice(-7)
            .map((name) => name.index + 1);
        const dots = [...marks.matchAll(/[·●◉]/g)].map((mark) => mark.index);
        assert.deepEqual(dots, middles);
        assert.match(frame, /\d\d:\d\d ● now\s+i to write the first entry of the day/);
        unmount();
    });

    it('names the week in one letter where the terminal is narrow', () => {
        resize(99);

        const {lastFrame, unmount} = render(<App today={TODAY} />);
        const frame = plain(lastFrame());

        assert.match(frame, /Thursday 24 September\s+m t w t f s s\n/);
        assert.match(frame, /nothing written yet\s+· · · ◉ · · ·\n/);
        unmount();
    });

    it('draws the day as a rail, gaps of half an hour spelled out', () => {
        store.add(TODAY, {time: '09:05', tag: 'meet', text: 'standup'});
        store.add(TODAY, {time: '09:40', tag: 'todo', text: 'review PR #412'});
        store.add(TODAY, {time: '09:50', tag: 'blocked', text: 'waiting on staging creds'});

        const {lastFrame, unmount} = render(<App today={TODAY} />);
        const frame = plain(lastFrame());

        assert.match(frame, /1 open · 1 blocked/);
        assert.match(
            frame,
            /09:05 ◆ standup\n\s+┆\n\s+┆ 35m\n\s+┆\n\s+09:40 ○ review PR #412\n\s+▌ 09:50 ✗ waiting on staging creds/,
        );
        unmount();
    });

    it('writes a tagged line to today and shows it', async () => {
        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        // written where now was, the glyph already showing the tag
        await type(stdin, 'i', '/done shipped the fix');
        assert.match(plain(lastFrame()), /▌ \d\d:\d\d ✓ \/done shipped the fix/);
        assert.doesNotMatch(plain(lastFrame()), /● now/);

        await type(stdin, '\r');

        const frame = plain(lastFrame());

        assert.match(frame, /▌ \d\d:\d\d ✓ shipped the fix/);
        assert.match(frame, /● now/);
        assert.deepEqual(
            store.load(TODAY).map(({tag, text}) => [tag, text]),
            [['done', 'shipped the fix']],
        );
        unmount();
    });

    it('ticks off a todo and deletes after confirming', async () => {
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review PR'});
        store.add(TODAY, {time: '10:00', tag: 'note', text: 'coffee'});

        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, 'k', 'x');
        assert.equal(store.load(TODAY)[0].tag, 'done');

        await type(stdin, 'j', 'd');
        assert.match(plain(lastFrame()), /delete "coffee"\?\s+y delete/);

        await type(stdin, 'y');
        assert.doesNotMatch(plain(lastFrame()), /coffee/);
        unmount();
    });

    it('moves between days that have entries', async () => {
        store.add('2026-09-20', {time: '17:00', tag: 'til', text: 'tsx reads tsconfig paths'});

        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, 'h');

        const frame = plain(lastFrame());

        assert.match(frame, /Sunday 20 September/);
        assert.match(frame, /17:00 ★ tsx reads tsconfig paths/);
        // the past has no now
        assert.doesNotMatch(frame, /● now/);

        await type(stdin, 't');
        assert.match(plain(lastFrame()), /Thursday 24 September/);
        unmount();
    });

    it('inserts new lines with shift+enter, option+enter and ctrl+j', async () => {
        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        // shift+enter as the kitty keyboard protocol reports it
        await type(stdin, 'i', 'one', '\u001b[13;2u', 'two', '\u001b\r', 'three', '\n', 'four');
        assert.match(plain(lastFrame()), /one\s*\n.*two\s*\n.*three\s*\n.*four/);

        await type(stdin, '\r');
        assert.equal(store.load(TODAY)[0].text, 'one\ntwo\nthree\nfour');

        assert.match(plain(lastFrame()), /▌ \d\d:\d\d • one\n *▌ {7}│ two\n *▌ {7}│ three/);
        unmount();
    });

    it('edits in the middle of a line', async () => {
        store.add(TODAY, {time: '09:00', tag: 'note', text: 'fix bug'});

        const {stdin, unmount} = render(<App today={TODAY} />);

        await type(stdin, 'e', '\u001b[D', '\u001b[D', '\u001b[D', 'the ', '\r');
        assert.equal(store.load(TODAY)[0].text, 'fix the bug');
        unmount();
    });

    it('takes a paste as text, newlines included, instead of as commands', async () => {
        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, '\u001b[200~dq\nxy\u001b[201~');
        assert.match(plain(lastFrame()), /enter save/);

        await type(stdin, '\r');
        assert.equal(store.load(TODAY)[0].text, 'dq\nxy');
        unmount();
    });

    it('wraps a long entry instead of cutting it off', async () => {
        const words = Array.from({length: 40}, (_, index) => `word${index}`).join(' ');

        store.add(TODAY, {time: '09:00', tag: 'note', text: words});

        const {lastFrame, unmount} = render(<App today={TODAY} />);

        const rows = plain(lastFrame())
            .split('\n')
            .filter((row) => row.includes('word'));

        assert.match(rows.join('\n'), /word39/);
        assert.equal(
            rows.some((row) => row.includes('…')),
            false,
        );
        unmount();
    });

    it('indents with tab and outdents with shift+tab', async () => {
        const {stdin, unmount} = render(<App today={TODAY} />);

        await type(
            stdin,
            'i',
            'refactored auth',
            '\n',
            '\t',
            '\t',
            '- split refresh',
            '\n',
            '\u001b[Z',
            'x',
            '\r',
        );
        assert.equal(store.load(TODAY)[0].text, 'refactored auth\n    - split refresh\n  x');
        unmount();
    });

    it('cycles the tag with ctrl+t', async () => {
        const {stdin, unmount} = render(<App today={TODAY} />);

        await type(stdin, 'i', '\u0014', '\u0014', 'ticked', '\r');
        assert.equal(store.load(TODAY)[0].tag, 'todo');
        unmount();
    });

    it('retags an entry when editing starts it with a /tag', async () => {
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'call the bank'});

        const {stdin, unmount} = render(<App today={TODAY} />);

        await type(stdin, 'e', '\u0001', '/d ', '\r');
        assert.deepEqual(
            store.load(TODAY).map(({tag, text}) => [tag, text]),
            [['done', 'call the bank']],
        );
        unmount();
    });

    it('shows the standup since the last journaled day', async () => {
        store.add('2026-09-18', {time: '17:00', tag: 'done', text: 'shipped the importer'});
        store.add('2026-09-18', {time: '17:30', tag: 'todo', text: 'write the migration guide'});
        store.add(TODAY, {time: '09:00', tag: 'blocked', text: 'waiting on staging creds'});
        store.add(TODAY, {time: '09:30', tag: 'note', text: 'coffee'});

        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, 's');

        const frame = plain(lastFrame());

        assert.match(frame, /Standup\s+since Friday 18 September/);
        assert.match(frame, /1 done · 1 next · 1 blocked/);
        assert.match(frame, /D O N E\n\s+✓ shipped the importer/);
        assert.match(frame, /N E X T\n\s+○ write the migration guide/);
        assert.match(frame, /B L O C K E D\n\s+✗ waiting on staging creds/);
        assert.doesNotMatch(frame, /coffee/);

        await type(stdin, '\u001b');
        assert.match(plain(lastFrame()), /Thursday 24 September/);
        unmount();
    });

    it('searches every day and opens the picked entry on its day', async () => {
        store.add('2026-09-18', {time: '17:00', tag: 'done', text: 'fixed the flaky login test'});
        store.add('2026-09-18', {time: '17:30', tag: 'note', text: 'unrelated'});
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'check login metrics'});

        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, '/', 'login');

        let frame = plain(lastFrame());

        assert.match(frame, /Search\s*\n\s*2 matches/);
        assert.match(frame, /Thursday 24 September\n\s+▌ 09:00 ○ check login metrics/);
        assert.match(frame, /Friday 18 September\n\s+17:00 ✓ fixed the flaky login test/);

        await type(stdin, '\u001b[B', '\r');
        frame = plain(lastFrame());

        assert.match(frame, /Friday 18 September/);
        assert.match(frame, /▌ 17:00 ✓ fixed the flaky login test/);
        unmount();
    });

    it('narrows a search by tag', async () => {
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'one'});
        store.add(TODAY, {time: '10:00', tag: 'done', text: 'two'});

        const {stdin, lastFrame, unmount} = render(<App today={TODAY} />);

        await type(stdin, '/', '/todo');
        assert.match(plain(lastFrame()), /1 match\b/);
        unmount();
    });

    it('undoes a delete, an edit and an add, newest first', async () => {
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review PR'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'i', 'typo', '\r');
        await type(stdin, 'k', 'x');
        await type(stdin, 'd', 'y');
        assert.deepEqual(
            store.load(TODAY).map(({text}) => text),
            ['typo'],
        );

        await type(stdin, 'u');
        assert.match(plain(lastFrame()), /Brought back "review PR"/);
        assert.deepEqual(
            store.load(TODAY).map(({tag, text}) => [tag, text]),
            [
                ['done', 'review PR'],
                ['note', 'typo'],
            ],
        );

        await type(stdin, 'u');
        assert.equal(store.load(TODAY)[0].tag, 'todo');

        await type(stdin, 'u');
        assert.match(plain(lastFrame()), /Took back "typo"/);
        assert.deepEqual(
            store.load(TODAY).map(({text}) => text),
            ['review PR'],
        );

        await type(stdin, 'u');
        assert.match(plain(lastFrame()), /Nothing to undo/);
    });

    it('lists open todos from every day and ticks them off where they are', async () => {
        store.add('2026-09-10', {time: '15:00', tag: 'todo', text: 'update the runbook'});
        store.add('2026-09-18', {time: '17:30', tag: 'todo', text: 'write the migration guide'});
        store.add(TODAY, {time: '09:00', tag: 'done', text: 'not a todo'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'o');

        let frame = plain(lastFrame());

        assert.match(frame, /Open todos\s*\n\s*2 open/);
        assert.match(frame, /M I D\n\s+▌ 10 Sept 15:00 ○ update the runbook/);
        assert.doesNotMatch(frame, /not a todo/);

        await type(stdin, 'x');
        frame = plain(lastFrame());

        assert.match(frame, /1 open/);
        assert.equal(store.load('2026-09-10')[0].tag, 'done');

        await type(stdin, 'u');
        assert.match(plain(lastFrame()), /2 open/);

        await type(stdin, 'j', '\r');
        assert.match(plain(lastFrame()), /▌ 17:30 ○ write the migration guide/);
    });

    it('carries open todos older than the standup into next, saying since when', async () => {
        store.add('2026-09-10', {time: '15:00', tag: 'todo', text: 'update the runbook'});
        store.add('2026-09-18', {time: '17:00', tag: 'done', text: 'shipped the importer'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 's');
        assert.match(plain(lastFrame()), /○ update the runbook\s+waiting since 10 Sept?/);
    });

    it('lists every key on ?', async () => {
        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, '?');
        assert.match(plain(lastFrame()), /J O U R N A L\n\s+i  enter\s+write a new entry/);

        await type(stdin, '\u001b');
        assert.match(plain(lastFrame()), /Thursday 24 September/);
    });

    it('changes settings on , and keeps them for next time', async () => {
        store.add(TODAY, {time: '09:05', tag: 'meet', text: 'standup'});
        store.add(TODAY, {time: '09:40', tag: 'note', text: 'after a break'});

        const first = render(<App today={TODAY} />);

        assert.match(plain(first.lastFrame()), /┆ 35m/);

        await type(first.stdin, ',');

        let frame = plain(first.lastFrame());

        assert.match(frame, /Settings\s*\n\s*Saved as you change them/);
        assert.match(frame, /▌ Show breaks from\s+‹ 30 minutes ›/);
        assert.match(frame, /Stretches between entries shorter than this/);

        // 30 → 45 → 1 hour → never
        await type(first.stdin, '\u001b[C', '\u001b[C', '\u001b[C');
        assert.match(plain(first.lastFrame()), /‹ never ›/);

        // down to the week start, over to Sunday
        await type(first.stdin, 'j', 'j', 'l');
        frame = plain(first.lastFrame());

        assert.match(frame, /▌ Week starts on\s+‹ Sunday ›/);
        assert.match(frame, /Show breaks from\s+never/);

        await type(first.stdin, '\u001b');
        frame = plain(first.lastFrame());

        assert.doesNotMatch(frame, /┆/);
        assert.match(frame, /s m t w t f s\n/);
        first.unmount();
        store.close();

        const second = render(<App today={TODAY} />);

        assert.match(plain(second.lastFrame()), /s m t w t f s\n/);
        assert.doesNotMatch(plain(second.lastFrame()), /┆/);
        second.unmount();
    });

    it('starts new entries as the chosen tag and hides the hints when asked', async () => {
        store.saveSetting('tag', 'todo');
        store.saveSetting('hints', false);

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        assert.doesNotMatch(plain(lastFrame()), /i write/);

        await type(stdin, 'i', 'ping ops');
        // what writing asks for is shown either way
        assert.match(plain(lastFrame()), /enter save/);
        assert.match(plain(lastFrame()), /○ ping ops/);

        await type(stdin, '\r');
        assert.equal(store.load(TODAY)[0].tag, 'todo');
    });

    it('moves on to the new day at midnight when looking at today', async () => {
        store.add(TODAY, {time: '23:40', tag: 'done', text: 'late fix'});

        const {lastFrame, rerender} = render(<App today={TODAY} />);

        assert.match(plain(lastFrame()), /Thursday 24 September[\s\S]*late fix/);

        rerender(<App today="2026-09-25" />);
        await settle();

        const frame = plain(lastFrame());

        assert.match(frame, /Friday 25 September/);
        assert.doesNotMatch(frame, /late fix/);
    });

    it('stays on another day at midnight', async () => {
        store.add('2026-09-20', {time: '10:00', tag: 'note', text: 'last sunday'});

        const {stdin, lastFrame, rerender} = render(<App today={TODAY} />);

        await type(stdin, 'h');
        rerender(<App today="2026-09-25" />);
        await settle();
        assert.match(plain(lastFrame()), /Sunday 20 September/);

        await type(stdin, 't');
        assert.match(plain(lastFrame()), /Friday 25 September/);
    });

    it('dates an entry with @time and sorts it into place', async () => {
        store.add(TODAY, {time: '09:00', tag: 'note', text: 'morning'});
        store.add(TODAY, {time: '09:20', tag: 'note', text: 'later'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'i', '@9:10 /done in between');
        assert.match(plain(lastFrame()), /▌ 09:10 ✓ @9:10 \/done in between/);

        await type(stdin, '\r');
        assert.match(
            plain(lastFrame()),
            /09:00 • morning\n\s+▌ 09:10 ✓ in between\n\s+09:20 • later/,
        );

        // and corrects the time of an existing entry
        await type(stdin, 'e', '\u0001', '@08:55 ', '\r');
        assert.deepEqual(
            store.load(TODAY).map(({time, text}) => [time, text]),
            [
                ['08:55', 'in between'],
                ['09:00', 'morning'],
                ['09:20', 'later'],
            ],
        );
    });

    it('moves an entry to another day and back with undo', async () => {
        store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped yesterday really'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'm');
        assert.match(
            plain(lastFrame()),
            /move "shipped yesterday really" to ‹ Wednesday 23 September ›/,
        );

        await type(stdin, 'h', '\r');
        assert.match(
            plain(lastFrame()),
            /Moved "shipped yesterday really" to Tuesday 22 September/,
        );
        assert.deepEqual(store.load(TODAY), []);
        assert.equal(store.load('2026-09-22')[0].time, '09:00');

        await type(stdin, 'u');
        assert.equal(store.load(TODAY).length, 1);
    });

    it("searches every day for an entry's first reference on #", async () => {
        store.add('2026-09-18', {time: '10:00', tag: 'done', text: 'first pass at #auth'});
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'finish #auth for PROJ-12'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, '#');

        const frame = plain(lastFrame());

        assert.match(frame, /Search\s*\n\s*2 matches/);
        assert.match(frame, /\/ #auth/);
    });

    it('shows times on a 12 hour clock when asked, the rail moving over with them', async () => {
        store.saveSetting('clock', '12h');
        store.add(TODAY, {time: '09:05', tag: 'meet', text: 'standup'});
        store.add(TODAY, {time: '21:30', tag: 'done', text: 'late deploy\nall green'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);
        const frame = plain(lastFrame());

        assert.match(
            frame,
            /\n {5}9:05am ◆ standup\n {12}┆\n {12}┆ 12h 25m\n {12}┆\n {2}▌ {2}9:30pm ✓ late deploy\n {2}▌ {9}│ all green/,
        );

        // either clock can be typed, whichever one is shown
        await type(stdin, 'i', '@22:45 wrap up', '\r');
        assert.match(plain(lastFrame()), /10:45pm • wrap up/);
        assert.equal(store.load(TODAY).at(-1).time, '22:45');
    });

    it('searches for everything with a colleague on @', async () => {
        store.add('2026-09-18', {time: '10:00', tag: 'meet', text: '1:1 with @anna'});
        store.add(TODAY, {time: '09:00', tag: 'done', text: 'paired with @Anna on #auth'});
        store.add(TODAY, {time: '09:10', tag: 'note', text: 'nobody mentioned'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, '@');
        assert.match(plain(lastFrame()), /mentions no @colleague/);

        await type(stdin, 'k', '@');

        const frame = plain(lastFrame());

        assert.match(frame, /\/ @Anna/);
        assert.match(frame, /2 matches/);
    });

    it('completes colleagues and topics used before while typing', async () => {
        store.add('2026-09-18', {time: '10:00', tag: 'meet', text: '1:1 with @anna'});
        store.add('2026-09-19', {
            time: '10:00',
            tag: 'meet',
            text: 'sync with @anna and @anton on #auth',
        });
        store.add('2026-09-20', {time: '10:00', tag: 'note', text: 'lunch with @andre'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'i', 'paired with @an');

        let frame = plain(lastFrame());

        // the best guess after the cursor, the others below
        assert.match(frame, /paired with @anna/);
        // @anna most used; @andre and @anton once each, @andre more recently
        assert.match(
            frame,
            /@anna {2}@andre {2}@anton\n\s*tab complete {3}\^n \^p choose {3}enter save/,
        );

        await type(stdin, '\u000e', '\u000e');
        assert.match(plain(lastFrame()), /paired with @anton/);

        await type(stdin, '\t', 'on #a', '\u001b[C', 'today', '\r');
        assert.equal(store.load(TODAY)[0].text, 'paired with @anton on #auth today');
    });

    it('still indents with tab where there is nothing to complete', async () => {
        store.add('2026-09-18', {time: '10:00', tag: 'meet', text: '1:1 with @anna'});

        const {stdin} = render(<App today={TODAY} />);

        await type(stdin, 'i', 'list', '\n', '\t', 'item @zed', '\t', '\r');
        assert.equal(store.load(TODAY)[0].text, 'list\n  item @zed');
    });

    it('asks in the row above the keys, the keys staying whole', async () => {
        const long = `I've asked @nikhil about his #TestingStandard project and what it means for the release train next quarter`;

        store.add(TODAY, {time: '09:00', tag: 'note', text: long});

        const {stdin, lastFrame} = render(<App today={TODAY} />);
        const bottom = () =>
            plain(lastFrame())
                .trimEnd()
                .split('\n')
                .slice(-2)
                .map((row) => row.trim());

        await type(stdin, 'd');

        let [question, keys] = bottom();

        assert.match(
            question,
            /^delete "I've asked @nikhil about his #TestingStandard project.*…"\?$/,
        );
        assert.equal(keys, 'y delete   any other key keeps it');

        await type(stdin, 'n', 'm');
        [question, keys] = bottom();

        assert.match(question, /^move "I've asked.*…" to ‹ Wednesday 23 September ›$/);
        assert.equal(keys, '←→ day   t today   enter move   esc cancel');

        // and when nothing is asked the row is blank, the keys where they were
        await type(stdin, '\u001b');
        [question, keys] = bottom();

        assert.equal(question, '');
        assert.match(keys, /^i write/);
    });

    it('prioritizes todos as they are written and afterwards', async () => {
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'plain task'});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'i', '/todo !c hotfix prod', '\r');
        assert.match(plain(lastFrame()), /▌ \d\d:\d\d ○ !! hotfix prod/);
        assert.equal(store.load(TODAY).at(-1).priority, 4);

        // up on the plain one: mid to high
        await type(stdin, 'k');
        await type(stdin, '+');
        assert.match(plain(lastFrame()), /09:00 ○ ! plain task/);
        assert.match(plain(lastFrame()), /"plain task" is high now/);

        await type(stdin, 'u');
        assert.equal(store.load(TODAY)[0].priority, undefined);

        await type(stdin, '-', '-');
        assert.match(plain(lastFrame()), /Already low/);
        assert.equal(store.load(TODAY)[0].priority, 1);
    });

    it('lists open todos as a backlog, the most urgent first', async () => {
        store.add('2026-09-10', {time: '15:00', tag: 'todo', text: 'update the runbook'});
        store.add('2026-09-18', {
            time: '10:00',
            tag: 'todo',
            text: 'hotfix the webhook',
            priority: 4,
        });
        store.add(TODAY, {time: '09:00', tag: 'todo', text: 'tidy the backlog', priority: 1});

        const {stdin, lastFrame} = render(<App today={TODAY} />);

        await type(stdin, 'o');

        const frame = plain(lastFrame());

        assert.match(
            frame,
            /C R I T I C A L\n\s+▌ 18 Sept 10:00 ○ !! hotfix the webhook\n\n\s*M I D\n\s+10 Sept 15:00 ○ update the runbook\n\n\s*L O W\n\s+24 Sept 09:00 ○ tidy the backlog/,
        );

        // the most urgent is selected; + and - work here too
        await type(stdin, 'j', '+');
        assert.equal(store.load('2026-09-10')[0].priority, 3);
        assert.match(plain(lastFrame()), /H I G H\n\s+▌ 10 Sept 15:00 ○ ! update the runbook/);
    });

    describe('with Jira', () => {
        const original = globalThis.fetch;
        let asked: string[];

        beforeEach(() => {
            asked = [];
            globalThis.fetch = (async (url: string) => {
                asked.push(url);

                return url.includes('ACME-4217')
                    ? new Response(JSON.stringify({fields: {summary: 'Download times out'}}), {
                          status: 200,
                      })
                    : new Response('{}', {status: 404});
            }) as unknown as typeof fetch;
        });

        afterEach(() => {
            globalThis.fetch = original;
        });

        it("shows a ticket's title after it once Jira has answered, and does not ask again", async () => {
            store.saveSetting('jira', true);
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217 and UTF-8'});

            const first = render(<App today={TODAY} />);

            await until(() => plain(first.lastFrame()).includes('[Download times out]'));
            assert.match(
                plain(first.lastFrame()),
                /✓ shipped ACME-4217\[Download times out\] and UTF-8/,
            );
            assert.deepEqual(asked.map((url) => url.replace(/\?.*/, '')).toSorted(), [
                'https://acme.atlassian.net/rest/api/2/issue/ACME-4217',
                'https://acme.atlassian.net/rest/api/2/issue/UTF-8',
            ]);

            // a ticket Jira knows links to it; one it does not stays text
            const frame = first.lastFrame();

            assert.ok(
                frame.includes(
                    '\u001b]8;;https://acme.atlassian.net/browse/ACME-4217\u0007ACME-4217\u001b]8;;\u0007',
                ),
            );
            assert.ok(!frame.includes('browse/UTF-8'));
            first.unmount();

            // from the cache, found or not
            const second = render(<App today={TODAY} />);

            assert.match(plain(second.lastFrame()), /ACME-4217\[Download times out\]/);
            await settle();
            assert.equal(asked.length, 2);
            second.unmount();
        });

        it("refreshes the day's tickets on r, however recently they were asked about", async () => {
            store.saveSetting('jira', true);
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.saveTitle('https://acme.atlassian.net', 'ACME-4217', 'An old title', 'open');
            store.saveTitle('https://acme.atlassian.net', 'UTF-8', null);
            store.saveTitle('https://acme.atlassian.net', 'OPS-9', 'Elsewhere', 'open');
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217 and UTF-8'});
            store.add('2026-09-20', {time: '09:00', tag: 'done', text: 'OPS-9 on another day'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await settle();
            assert.match(plain(lastFrame()), /ACME-4217\[An old title\]/);
            // fresh in the cache, so nothing is asked in the background
            assert.deepEqual(asked, []);

            await type(stdin, 'r');
            await settle();

            const frame = plain(lastFrame());

            assert.match(frame, /ACME-4217\[Download times out\]/);
            assert.match(frame, /Refreshed 1 ticket, 1 not in Jira/);
            assert.equal(asked.length, 2);
            assert.ok(!asked.some((url) => url.includes('OPS-9')));
        });

        it('says so when there is nothing to refresh, or no Jira to ask', async () => {
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217'});
            store.add('2026-09-20', {time: '09:00', tag: 'note', text: 'no tickets here'});

            const first = render(<App today={TODAY} />);

            await type(first.stdin, 'r');
            await settle();
            assert.match(
                plain(first.lastFrame()),
                /Turn on Jira under modules to show ticket titles/,
            );

            await type(first.stdin, 'h', 'r');
            assert.match(plain(first.lastFrame()), /No tickets or pull requests on this day/);
            first.unmount();

            // on, but without a site to ask
            store.saveSetting('jira', true);

            const second = render(<App today={TODAY} />);

            await type(second.stdin, 'r');
            await settle();
            assert.match(
                plain(second.lastFrame()),
                /Set up Jira under modules to show ticket titles/,
            );
            assert.deepEqual(asked, []);
        });

        it('shows no titles or links while turned off, and asks nothing', async () => {
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.saveTitle('https://acme.atlassian.net', 'ACME-4217', 'Download times out');
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217'});

            const {lastFrame} = render(<App today={TODAY} />);

            await settle();
            assert.match(plain(lastFrame()), /✓ shipped ACME-4217\s*$/m);
            assert.ok(!lastFrame().includes('browse/ACME-4217'));
            assert.deepEqual(asked, []);
        });

        it('is turned on and set up under modules, the token never shown', async () => {
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            // the general settings leave the modules to their own page
            await type(stdin, ',');
            assert.doesNotMatch(plain(lastFrame()), /Jira/);

            await type(stdin, '\t');
            assert.match(plain(lastFrame()), /Modules[\s\S]*▌ Jira\s+‹ off ›/);
            assert.match(plain(lastFrame()), /Turn it on to set it up/);

            // off, there is nothing to set up
            await type(stdin, '\r');
            assert.doesNotMatch(plain(lastFrame()), /Modules › Jira/);

            await type(stdin, 'l');
            assert.match(plain(lastFrame()), /▌ Jira\s+‹ on ›\s+not set up/);
            assert.equal(store.loadSettings().jira, true);

            await type(stdin, '\r');
            assert.match(plain(lastFrame()), /Modules › Jira/);
            assert.match(plain(lastFrame()), /▌ Site\s+‹ not set ›/);
            assert.doesNotMatch(plain(lastFrame()), /Enabled/);
            // what it cannot do without first, apart from the rest
            assert.match(
                plain(lastFrame()),
                /R E Q U I R E D\n\s+▌ Site\s+‹ not set ›\n\s+Token\s+not set\n\n\s+O P T I O N A L\n\s+Email\s+not set/,
            );
            assert.match(plain(lastFrame()), /Jira needs setting up/);

            await type(stdin, '\r', 'acme.atlassian.net', '\r');
            assert.match(plain(lastFrame()), /▌ Site\s+‹ acme\.atlassian\.net ›/);

            await type(stdin, 'j', '\r', 'ATATT3xFfGF0abcd1234');
            assert.doesNotMatch(plain(lastFrame()), /ATATT/);

            await type(stdin, '\r');
            await settle();
            assert.match(plain(lastFrame()), /▌ Token\s+‹ ••••••••1234 ›/);
            assert.equal(store.loadSettings().jiraToken, 'ATATT3xFfGF0abcd1234');
            // no ticket is on screen here, so nothing is asked yet
            assert.match(
                plain(lastFrame()),
                /Set up; Jira is asked about tickets once they are on screen/,
            );
            assert.deepEqual(asked, []);

            await type(stdin, '\u001b', '\u001b');
            await until(() => plain(lastFrame()).includes('[Download times out]'));
            assert.match(plain(lastFrame()), /shipped ACME-4217\[Download times out\]/);

            await type(stdin, ',', '\t');
            assert.match(plain(lastFrame()), /▌ Jira\s+‹ on ›\s+working/);

            await type(stdin, '\r');
            assert.match(plain(lastFrame()), /Jira answered/);
        });

        it('asks about the tickets of open todos too, wherever they are', async () => {
            store.saveSetting('jira', true);
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'note', text: 'nothing to look up'});
            store.add('2026-09-18', {time: '09:00', tag: 'todo', text: 'fix ACME-4217'});
            // a todo ticked off is done
            store.add('2026-09-18', {time: '10:00', tag: 'done', text: 'fix OPS-7'});
            store.add('2026-09-18', {time: '11:00', tag: 'note', text: 'read up on OPS-9'});

            render(<App today={TODAY} />);

            await settle();
            // the ticked off todo and the note wait until they are on screen
            assert.deepEqual(
                asked.map((url) => url.replace(/\?.*/, '').split('/').pop()),
                ['ACME-4217'],
            );
        });

        it('asks only about the tickets on screen', async () => {
            store.saveSetting('jira', true);
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'shipped ACME-4217'});
            store.add('2026-09-20', {time: '09:00', tag: 'done', text: 'looked at OPS-9'});

            const {stdin} = render(<App today={TODAY} />);

            await settle();
            assert.deepEqual(
                asked.map((url) => url.replace(/\?.*/, '').split('/').pop()),
                ['ACME-4217'],
            );

            // the other day, once it is looked at
            await type(stdin, 'h');
            await settle();
            assert.deepEqual(
                asked.map((url) => url.replace(/\?.*/, '').split('/').pop()),
                ['ACME-4217', 'OPS-9'],
            );
        });

        it('goes between settings and modules on tab', async () => {
            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await type(stdin, ',', '\t');
            assert.match(plain(lastFrame()), /Modules/);

            await type(stdin, '\t');
            assert.match(plain(lastFrame()), /Settings[\s\S]*Show breaks from/);
        });
    });

    describe('with GitHub', () => {
        const original = globalThis.fetch;
        let asked: unknown[];

        beforeEach(() => {
            asked = [];
            globalThis.fetch = (async (_url: string, init: RequestInit) => {
                const {variables} = JSON.parse(init.body as string);

                asked.push(variables);

                return new Response(
                    JSON.stringify({
                        data: {
                            repository: {
                                issueOrPullRequest: PULLS[variables.number] ?? null,
                            },
                        },
                    }),
                    {status: 200},
                );
            }) as unknown as typeof fetch;
        });

        afterEach(() => {
            globalThis.fetch = original;
        });

        it('gives short names their repositories on a page of their own', async () => {
            store.saveSetting('github', true);
            store.add(TODAY, {time: '09:00', tag: 'done', text: 'merged legacy#15'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await type(stdin, ',', '\t', 'j', '\r');
            assert.match(plain(lastFrame()), /▌ Repositories\s+‹ none yet ›/);

            await type(stdin, '\r');
            assert.match(plain(lastFrame()), /Modules › GitHub › Repositories/);
            // a short name the journal uses is offered, waiting for its repository
            assert.match(plain(lastFrame()), /▌ legacy\s+not set, used in your journal/);

            await type(stdin, '\r', 'nope', '\r');
            assert.match(plain(lastFrame()), /That is not a repository/);

            await type(stdin, '\u0015', 'sovrin/sonotas', '\r');
            assert.deepEqual(repositories(), {legacy: 'sovrin/sonotas'});

            // added from its address, its own name offered as the short name
            await type(stdin, 'a', 'https://github.com/acme/web-app.git', '\r');
            assert.match(plain(lastFrame()), /▌ web-app\s+acme\/web-app/);

            await type(stdin, '\r');
            assert.deepEqual(repositories(), {legacy: 'sovrin/sonotas', 'web-app': 'acme/web-app'});

            // renamed, keeping its repository
            await type(stdin, '\r', '\r', '\u0015', 'web', '\r');
            assert.deepEqual(repositories(), {legacy: 'sovrin/sonotas', web: 'acme/web-app'});

            // a short name is given once, whatever its case
            await type(stdin, 'a', 'x/y', '\r', '\u0015', 'Legacy', '\r');
            assert.match(plain(lastFrame()), /Legacy is taken already/);

            await type(stdin, '\u001b', 'k', 'd');
            assert.deepEqual(repositories(), {legacy: 'sovrin/sonotas'});

            await type(stdin, '\u001b');
            assert.match(plain(lastFrame()), /▌ Repositories\s+‹ legacy → sovrin\/sonotas ›/);
        });

        it("shows a pull request's checks in the colour of its underline, its title after it", async () => {
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {
                time: '09:00',
                tag: 'todo',
                text: 'review legacy#12 and legacy#99, not other#3',
            });

            const {lastFrame} = render(<App today={TODAY} />);

            await until(() => plain(lastFrame()).includes('[Fix login]'));
            assert.match(
                plain(lastFrame()),
                /review legacy#12\[Fix login\] and legacy#99, not other#3/,
            );
            // failing, so its underline is red; no mark, that is for colour-blind mode
            assert.ok(lastFrame().includes('\u001b[58:5:1mlegacy#12'));
            assert.ok(!lastFrame().includes('\u001b[58:5:1mlegacy#99'));
            // a short name without a repository is not asked about
            assert.deepEqual(asked, [
                {owner: 'sovrin', name: 'sonotas', number: 12},
                {owner: 'sovrin', name: 'sonotas', number: 99},
            ]);

            const frame = lastFrame();

            assert.ok(
                frame.includes(
                    '\u001b]8;;https://github.com/sovrin/sonotas/issues/12\u0007\u001b[58:5:1mlegacy#12\u001b]8;;\u0007',
                ),
            );
            assert.ok(!frame.includes('issues/99'));
        });

        it("writes a pull request's title the way its template is typed", async () => {
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review legacy#12'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await until(() => plain(lastFrame()).includes('[Fix login]'));

            // past what it needs and what it shows, to how it writes things
            await type(stdin, ',', '\t', 'j', '\r', 'j', 'j', 'j', 'j', 'j');
            assert.match(
                plain(lastFrame()),
                /T E M P L A T E S\n\s+▌ Title\s+‹ \{ref\}\[\{title\}\] ›/,
            );
            assert.match(plain(lastFrame()), /Looks like legacy#12\[Fix login\]/);

            // typed from its default, and shown as it is typed
            await type(stdin, '\r', '\u0015', '{ref} ({title})');
            assert.match(plain(lastFrame()), /Looks like legacy#12 \(Fix login\)/);

            await type(stdin, '\r', '\u001b', '\u001b', '\u001b');
            assert.equal(store.loadSettings().githubTitleTemplate, '{ref} ({title})');
            assert.match(plain(lastFrame()), /review legacy#12 \(Fix login\)/);
            assert.equal(asked.length, 1);
        });

        it('marks the checks after a pull request in colour-blind mode', async () => {
            store.saveSetting('colourBlind', true);
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review legacy#12 and legacy#12'});

            const {lastFrame} = render(<App today={TODAY} />);

            await until(() => plain(lastFrame()).includes('[Fix login]'));
            assert.match(plain(lastFrame()), /review legacy#12 ✗\[Fix login\] and legacy#12 ✗/);
            assert.ok(!lastFrame().includes('\u001b[58:5:'));
        });

        it('shows as much as it is set to, without asking again', async () => {
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review legacy#12'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await until(() => plain(lastFrame()).includes('[Fix login]'));
            assert.match(plain(lastFrame()), /review legacy#12\[Fix login\]/);
            assert.ok(lastFrame().includes('\u001b[58:5:1mlegacy#12'));
            assert.equal(asked.length, 1);

            // titles, then badges, turned off on the GitHub page
            await type(stdin, ',', '\t', 'j', '\r', 'j', 'j', 'h');
            assert.match(plain(lastFrame()), /▌ Titles\s+‹ hidden ›/);

            await type(stdin, 'j', 'h');
            assert.match(plain(lastFrame()), /▌ Checks\s+‹ hidden ›/);

            await type(stdin, '\u001b', '\u001b');
            await settle();
            assert.match(plain(lastFrame()), /review legacy#12\s*$/m);
            assert.equal(asked.length, 1);
        });

        it('colours only the badge, and leaves what is finished with behind', async () => {
            const level = chalk.level;

            chalk.level = 1;

            try {
                // the badge as a mark, to see what colour it is
                store.saveSetting('colourBlind', true);
                store.saveSetting('github', true);
                store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
                store.saveSetting('githubToken', 'secret');
                store.add(TODAY, {
                    time: '09:00',
                    tag: 'note',
                    text: 'review legacy#12, after legacy#13 and legacy#14',
                });

                const {lastFrame} = render(<App today={TODAY} />);

                await until(() => plain(lastFrame()).includes('[Try another way]'));

                const frame = lastFrame();

                // the failing checks are red, the pull request and its title are not
                assert.equal(colourAt(frame, '✗'), RED);
                assert.equal(colourAt(frame, 'legacy#12'), undefined);
                assert.equal(colourAt(frame, '[Fix login]'), undefined);
                assert.equal(styleAt(frame, '[Fix login]', DIM), true);
                assert.equal(styleAt(frame, 'legacy#12', DIM), false);

                // merged is done, and faded; closed was dropped, and struck through
                assert.equal(styleAt(frame, 'legacy#13', DIM), true);
                assert.equal(styleAt(frame, 'legacy#13', STRUCK), false);
                assert.equal(styleAt(frame, 'legacy#14', DIM), true);
                assert.equal(styleAt(frame, 'legacy#14', STRUCK), true);
                // its title with it; a merged one's is only faded
                assert.equal(styleAt(frame, '[Try another way]', STRUCK), true);
                assert.equal(styleAt(frame, '[Drop cookies]', STRUCK), false);
            } finally {
                chalk.level = level;
            }
        });

        it('counts what Jira and GitHub refreshed together, and says what each did not find', async () => {
            const github = globalThis.fetch;

            globalThis.fetch = (async (url: string, init: RequestInit) =>
                url.includes('atlassian')
                    ? new Response('{}', {status: 404})
                    : github(url, init)) as unknown as typeof fetch;
            store.saveSetting('jira', true);
            store.saveSetting('jiraSite', 'acme.atlassian.net');
            store.saveSetting('jiraToken', 'secret');
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {
                time: '09:00',
                tag: 'done',
                text: 'shipped ACME-4217, legacy#12, legacy#13 and legacy#14',
            });

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await settle();
            await type(stdin, 'r');
            await until(() => plain(lastFrame()).includes('Refreshed'));
            assert.match(plain(lastFrame()), /Refreshed 3 references, 1 not in Jira/);
        });

        it('says which pull requests GitHub did not find, and what to check', async () => {
            store.saveSetting('github', true);
            store.saveSetting('githubRepositories', {legacy: 'sovrin/sonotas'});
            store.saveSetting('githubToken', 'secret');
            store.add(TODAY, {time: '09:00', tag: 'todo', text: 'review legacy#12 and legacy#99'});

            const {stdin, lastFrame} = render(<App today={TODAY} />);

            await settle();
            await type(stdin, ',', '\t', 'j');
            assert.match(plain(lastFrame()), /▌ GitHub\s+‹ on ›\s+1 not found/);

            await type(stdin, '\r');
            assert.match(
                plain(lastFrame()),
                /GitHub did not find legacy#99\. GitHub treats a repository/,
            );
        });
    });
});
