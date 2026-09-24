import {parseArgs} from 'node:util';
import {version} from '#/const';
import {prepare} from '#/services/journal';
import {normalize} from '#/services/settings';
import * as store from '#/services/store';
import {formatTime, toClock, toKey} from '#/utils';

export type Result = {
    text: string;
    code: number;
};

export const USAGE = `usage: codi [command]

  codi                     open the journal
  codi add <text>          add an entry to today; /todo tags it, @10:30 or @10:30pm dates it
  codi add /done -         read the text from stdin
  codi --help, -h          show this
  codi --version, -v       show the version`;

/**
 * Everything piped in, as text.
 */
const stdin = async (): Promise<string> => {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString('utf-8');
};

/**
 * Adds an entry without opening the journal, for aliases, git hooks and
 * scripts. Stdin is only read when asked for with "-": reading it whenever it
 * is not a terminal would hang any script that leaves it open.
 *
 * @param words
 * @param read
 */
const add = async (words: string[], read: () => Promise<string>): Promise<Result> => {
    const parts = await Promise.all(words.map((word) => (word === '-' ? read() : word)));
    const settings = normalize(store.loadSettings());
    const prepared = prepare(parts.join(' '), settings.tag);

    if (!prepared) {
        return {text: 'nothing to add', code: 2};
    }

    const time = prepared.time ?? toClock();

    store.add(toKey(), {...prepared, time});

    return {
        text: `added ${prepared.tag} at ${formatTime(time, settings.clock).trim()}: ${prepared.text.split('\n')[0]}`,
        code: 0,
    };
};

const OPTIONS = {
    help: {type: 'boolean', short: 'h'},
    version: {type: 'boolean', short: 'v'},
} as const;

/**
 * What to do with the command line. Undefined means no command: open the
 * journal.
 *
 * @param args
 * @param read where "-" reads from
 */
export const command = async (args: string[], read = stdin): Promise<Result | undefined> => {
    // flags are only read up to the command, so its own words - "/todo", "-" -
    // are left alone
    const at = args.findIndex((arg) => !arg.startsWith('-'));
    const [name, ...rest] = at === -1 ? [] : args.slice(at);
    let flags: {help?: boolean; version?: boolean};

    try {
        ({values: flags} = parseArgs({
            args: at === -1 ? args : args.slice(0, at),
            options: OPTIONS,
            strict: true,
        }));
    } catch (reason) {
        return {text: `${(reason as Error).message}\n\n${USAGE}`, code: 2};
    }

    if (flags.help) {
        return {text: USAGE, code: 0};
    }

    if (flags.version) {
        return {text: version, code: 0};
    }

    switch (name) {
        case undefined:
            return undefined;

        case 'add':
            return add(rest, read);

        default:
            return {text: `unknown command: ${name}\n\n${USAGE}`, code: 2};
    }
};
