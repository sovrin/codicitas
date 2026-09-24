import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {DATA_DIR, DATABASE_FILE, SEARCH_LIMIT} from '#/const';
import {type Entry, MID, type Priority, type Tag, TAGS} from './journal';
import {isTicket, type Kind, mentionsIn} from './references';

/**
 * Writes down who and what an entry mentions. The text stays what counts;
 * this is an index of it, rebuilt whenever the text changes.
 *
 * @param db
 * @param id
 * @param text
 */
const index = (db: DatabaseSync, id: number, text: string): void => {
    db.prepare('DELETE FROM mentions WHERE entry_id = ?').run(id);

    const insert = db.prepare('INSERT INTO mentions (entry_id, kind, name) VALUES (?, ?, ?)');

    for (const {kind, name} of mentionsIn(text)) {
        insert.run(id, kind, name);
    }
};

/**
 * Applied in order, each exactly once; PRAGMA user_version records how far a
 * database has come. Append to change the schema, never edit a shipped step.
 * A step is SQL, or code where it has to read what is already there.
 */
const MIGRATIONS: (string | ((db: DatabaseSync) => void))[] = [
    `CREATE TABLE entries (
        id INTEGER PRIMARY KEY,
        day TEXT NOT NULL,
        time TEXT NOT NULL,
        tag TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX entries_day ON entries (day, id);`,
    `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );`,
    (db) => {
        db.exec(`CREATE TABLE mentions (
            entry_id INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            PRIMARY KEY (entry_id, kind, name)
        );
        CREATE INDEX mentions_name ON mentions (kind, name COLLATE NOCASE);`);

        // everything written before there was an index
        for (const {id, text} of db.prepare('SELECT id, text FROM entries').all() as {
            id: number;
            text: string;
        }[]) {
            index(db, id, text);
        }
    },
    // empty for every entry so far, which is what mid is
    'ALTER TABLE entries ADD COLUMN priority INTEGER;',
    // what Jira said about each ticket, per site, so a new site starts over;
    // a null title is a ticket Jira did not know
    `CREATE TABLE tickets (
        site TEXT NOT NULL,
        key TEXT NOT NULL,
        title TEXT,
        asked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (site, key)
    );`,
];

/**
 * CODICITAS_DIR wins, then the XDG basedir spec.
 */
export const directory = (): string => {
    const {CODICITAS_DIR, XDG_DATA_HOME} = process.env;

    if (CODICITAS_DIR) {
        return CODICITAS_DIR;
    }

    const base = XDG_DATA_HOME?.trim() ? XDG_DATA_HOME : join(homedir(), '.local', 'share');

    return join(base, DATA_DIR);
};

export const path = (): string => join(directory(), DATABASE_FILE);

const migrate = (db: DatabaseSync): void => {
    const {user_version: version} = db.prepare('PRAGMA user_version').get() as {
        user_version: number;
    };

    for (let step = version; step < MIGRATIONS.length; step++) {
        db.exec('BEGIN');

        try {
            const migration = MIGRATIONS[step];

            if (typeof migration === 'string') {
                db.exec(migration);
            } else {
                migration(db);
            }

            db.exec(`PRAGMA user_version = ${step + 1}`);
            db.exec('COMMIT');
        } catch (reason) {
            db.exec('ROLLBACK');
            throw reason;
        }
    }
};

let connection: {path: string; db: DatabaseSync} | undefined;

/**
 * Opened on first use and kept for the life of the process. Reopened when the
 * location changes, which only happens between tests.
 */
const db = (): DatabaseSync => {
    const file = path();

    if (connection?.path === file) {
        return connection.db;
    }

    close();
    mkdirSync(directory(), {recursive: true});

    const opened = new DatabaseSync(file);

    opened.exec('PRAGMA journal_mode = WAL');
    // off by default in SQLite; it is what takes an entry's mentions with it
    opened.exec('PRAGMA foreign_keys = ON');
    migrate(opened);
    connection = {path: file, db: opened};

    return opened;
};

export const close = (): void => {
    connection?.db.close();
    connection = undefined;
};

type Row = {id: number; time: string; tag: string; text: string; priority: number | null};

const COLUMNS = 'id, time, tag, text, priority';

const toEntry = ({id, time, tag, text, priority}: Row): Entry => ({
    id,
    time,
    tag: TAGS.includes(tag as Tag) ? (tag as Tag) : 'note',
    text,
    ...(priority !== null && priority >= 1 && priority <= 4
        ? {priority: priority as Priority}
        : {}),
});

/**
 * Every day that has at least one entry, newest first.
 */
export const days = (): string[] =>
    (
        db().prepare('SELECT DISTINCT day FROM entries ORDER BY day DESC').all() as {day: string}[]
    ).map(({day}) => day);

/**
 *
 * @param day
 */
export const load = (day: string): Entry[] =>
    // by time, so an entry written down late still lands where it happened
    (
        db()
            .prepare(`SELECT ${COLUMNS} FROM entries WHERE day = ? ORDER BY time, id`)
            .all(day) as Row[]
    ).map(toEntry);

/**
 * The last day with entries before the given one.
 *
 * @param day
 */
export const previousDay = (day: string): string | undefined => {
    const {previous} = db()
        .prepare('SELECT MAX(day) AS previous FROM entries WHERE day < ?')
        .get(day) as {previous: string | null};

    return previous ?? undefined;
};

export type Found = Entry & {day: string};

/**
 * A row as stored, timestamps included, so a deleted entry can be put back
 * exactly as it was.
 */
export type Stored = Found & {createdAt: string; updatedAt: string};

const escape = (term: string): string => term.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Entries holding every term, newest first. LIKE is case insensitive for
 * ASCII, which is what a journal written in English mostly is; a journal the
 * size of one person's working life stays far below where an index would pay.
 *
 * @param terms
 * @param tag
 * @param priority
 * @param limit
 */
export const search = (
    terms: string[],
    tag?: Tag,
    priority?: Priority,
    limit = SEARCH_LIMIT,
): Found[] => {
    const conditions = terms.map(() => `text LIKE ? ESCAPE '\\'`);
    const values: (string | number)[] = terms.map((term) => `%${escape(term)}%`);

    if (tag) {
        conditions.push('tag = ?');
        values.push(tag);
    }

    if (priority) {
        conditions.push(`COALESCE(priority, ${MID}) = ?`);
        values.push(priority);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db()
        .prepare(
            `SELECT ${COLUMNS}, day FROM entries ${where} ORDER BY day DESC, time DESC, id DESC LIMIT ?`,
        )
        .all(...values, limit) as (Row & {day: string})[];

    return rows.map((row) => ({...toEntry(row), day: row.day}));
};

/**
 * Every todo not ticked off yet, from any day: the most urgent first, and
 * within a priority the oldest - the order they have been waiting in.
 */
export const openTodos = (): Found[] =>
    (
        db()
            .prepare(
                `SELECT ${COLUMNS}, day FROM entries WHERE tag = 'todo' ORDER BY COALESCE(priority, ${MID}) DESC, day, time, id`,
            )
            .all() as (Row & {day: string})[]
    ).map((row) => ({...toEntry(row), day: row.day}));

/**
 *
 * @param id
 */
export const get = (id: number): Stored | undefined => {
    const row = db()
        .prepare(
            `SELECT ${COLUMNS}, day, created_at AS createdAt, updated_at AS updatedAt FROM entries WHERE id = ?`,
        )
        .get(id) as (Row & {day: string; createdAt: string; updatedAt: string}) | undefined;

    if (!row) {
        return undefined;
    }

    const {day, createdAt, updatedAt} = row;

    return {...toEntry(row), day, createdAt, updatedAt};
};

/**
 * Puts a removed row back under its old id, so it returns to its old place in
 * the day.
 *
 * @param row
 */
export const restore = ({
    id,
    day,
    time,
    tag,
    text,
    priority,
    createdAt,
    updatedAt,
}: Stored): void => {
    db()
        .prepare(
            'INSERT INTO entries (id, day, time, tag, text, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(id, day, time, tag, text, priority ?? null, createdAt, updatedAt);

    index(db(), id, text);
};

/**
 *
 * @param day
 * @param entry
 */
export const add = (day: string, {time, tag, text, priority}: Omit<Entry, 'id'>): number => {
    const {lastInsertRowid} = db()
        .prepare('INSERT INTO entries (day, time, tag, text, priority) VALUES (?, ?, ?, ?, ?)')
        .run(day, time, tag, text, priority ?? null);
    const id = Number(lastInsertRowid);

    index(db(), id, text);

    return id;
};

type Change = Pick<Entry, 'tag' | 'text'> & {
    time?: string;
    /**
     * Left alone when missing; null takes it away, back to mid.
     */
    priority?: Priority | null;
};

/**
 * Changes an entry's tag and text, and its time and priority when given.
 *
 * @param id
 * @param change
 */
export const update = (id: number, {tag, text, time, priority}: Change): void => {
    db()
        .prepare(
            `UPDATE entries SET tag = ?, text = ?, time = COALESCE(?, time), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        )
        .run(tag, text, time ?? null, id);

    if (priority !== undefined) {
        db().prepare('UPDATE entries SET priority = ? WHERE id = ?').run(priority, id);
    }

    index(db(), id, text);
};

/**
 * Moves an entry to another day, keeping its time.
 *
 * @param id
 * @param day
 */
export const move = (id: number, day: string): void => {
    db()
        .prepare(
            `UPDATE entries SET day = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
        )
        .run(day, id);
};

/**
 *
 * @param id
 */
export const remove = (id: number): void => {
    db().prepare('DELETE FROM entries WHERE id = ?').run(id);
};

/**
 * Every stored setting, as stored. Values are JSON, so a number stays a
 * number; making sense of them is the settings service's job.
 */
export const loadSettings = (): Record<string, unknown> =>
    Object.fromEntries(
        (
            db().prepare('SELECT key, value FROM settings').all() as {key: string; value: string}[]
        ).map(({key, value}) => {
            try {
                return [key, JSON.parse(value)];
            } catch {
                return [key, undefined];
            }
        }),
    );

/**
 *
 * @param key
 * @param value
 */
export const saveSetting = (key: string, value: unknown): void => {
    db()
        .prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        )
        .run(key, JSON.stringify(value));
};

/**
 * The colleagues or topics mentioned so far, the most used first and, among
 * equals, the most recent. Spelled the way they were last written, so a
 * mention written @Anna once and @anna since is offered as @anna.
 *
 * @param kind
 */
export const known = (kind: Kind): string[] =>
    (
        db()
            .prepare(`
        SELECT m.name, COUNT(*) AS uses, MAX(e.day || ' ' || e.time) AS last
        FROM mentions m JOIN entries e ON e.id = m.entry_id
        WHERE m.kind = ?
        GROUP BY m.name COLLATE NOCASE
        ORDER BY uses DESC, last DESC
    `)
            .all(kind) as {name: string}[]
    ).map(({name}) => name);

/**
 * Every ticket mentioned so far, as written.
 */
export const tickets = (): string[] =>
    (
        db().prepare("SELECT DISTINCT name FROM mentions WHERE kind = 'topic'").all() as {
            name: string;
        }[]
    )
        .map(({name}) => name)
        .filter(isTicket);

/**
 * The titles known for a site's tickets.
 *
 * @param site
 */
export const titles = (site: string): Map<string, string> =>
    new Map(
        (
            db()
                .prepare('SELECT key, title FROM tickets WHERE site = ? AND title IS NOT NULL')
                .all(site) as {key: string; title: string}[]
        ).map(({key, title}) => [key, title]),
    );

/**
 * When each of a site's tickets was last asked about, found or not.
 *
 * @param site
 */
export const asked = (site: string): Map<string, string> =>
    new Map(
        (
            db()
                .prepare('SELECT key, asked_at AS askedAt FROM tickets WHERE site = ?')
                .all(site) as {key: string; askedAt: string}[]
        ).map(({key, askedAt}) => [key, askedAt]),
    );

/**
 * What Jira said about a ticket; null for a ticket it does not know.
 *
 * @param site
 * @param key
 * @param title
 */
export const saveTitle = (site: string, key: string, title: string | null): void => {
    db()
        .prepare(`INSERT INTO tickets (site, key, title) VALUES (?, ?, ?)
            ON CONFLICT (site, key) DO UPDATE SET title = excluded.title, asked_at = excluded.asked_at`)
        .run(site, key, title);
};
