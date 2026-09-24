import {spawnSync} from 'node:child_process';

const COMMANDS: Partial<Record<NodeJS.Platform, string[][]>> = {
    darwin: [['pbcopy']],
    win32: [['clip']],
    linux: [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']],
};

export type Result = 'copied' | 'terminal';

/**
 * Hands text to the system clipboard. Where no clipboard program answers - a
 * remote shell, a bare linux box - the text goes to the terminal as OSC 52,
 * which most modern terminals put on the clipboard of the machine in front of
 * you. Whether it did cannot be known, hence the separate result.
 *
 * @param text
 */
export const copy = (text: string): Result => {
    for (const [command, ...args] of COMMANDS[process.platform] ?? []) {
        const {status, error} = spawnSync(command, args, {
            input: text,
            stdio: ['pipe', 'ignore', 'ignore'],
        });

        if (!error && status === 0) {
            return 'copied';
        }
    }

    process.stdout.write(`\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`);

    return 'terminal';
};
