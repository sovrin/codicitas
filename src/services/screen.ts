/**
 * The alternate screen buffer, the thing vim, less and htop use: the shell
 * draws on a second buffer, and leaving it restores whatever the terminal
 * showed before, scrollback included.
 */
const ENTER = '\x1b[?1049h';
const LEAVE = '\x1b[?1049l';

let isActive = false;
let isInstalled = false;

/**
 * Only a real terminal has a second buffer. Piped output - piped into a
 * status bar, a test harness - must stay plain.
 */
export const isSupported = (): boolean => Boolean(process.stdout.isTTY);

/**
 * Restores the original screen. Safe to call more than once, which matters
 * because it runs from several exit paths.
 */
export const leave = (): void => {
    if (!isActive) {
        return;
    }

    isActive = false;
    process.stdout.write(LEAVE);
};

/**
 * Leaving has to happen no matter how the process ends, or the terminal is left
 * showing an empty buffer with the user's scrollback hidden behind it. Writes to
 * a tty are synchronous, so this still lands from an exit handler.
 */
const install = (): void => {
    if (isInstalled) {
        return;
    }

    isInstalled = true;

    process.once('exit', leave);

    // ctrl+c is read as a byte in raw mode and never reaches here; these are for
    // being killed from outside
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.once(signal, () => {
            leave();
            process.exit(signal === 'SIGINT' ? 130 : 143);
        });
    }

    process.once('uncaughtException', (error: Error) => {
        leave();
        process.stderr.write(`${error.stack ?? error.message}\n`);
        process.exit(1);
    });
};

export const enter = (): void => {
    if (isActive || !isSupported()) {
        return;
    }

    isActive = true;
    install();
    process.stdout.write(ENTER);
};
