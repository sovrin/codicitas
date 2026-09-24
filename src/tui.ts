import {createElement} from 'react';
import {render} from 'ink';
import {App} from '#/components';
import * as screen from '#/services/screen';

/**
 * Opens the journal and resolves once it is closed. Kept apart from the
 * command line, so a command never loads react, ink or the views.
 */
export const start = async (): Promise<void> => {
    // entered before the first frame so nothing is drawn over the terminal the
    // user was looking at, and left again on the way out
    screen.enter();

    // Ink asks the terminal whether it speaks the kitty keyboard protocol,
    // which is what tells shift+enter apart from enter, before it turns off
    // echo on its own; the answer would otherwise be printed as ^[[?0u
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    const {waitUntilExit} = render(createElement(App), {kittyKeyboard: {mode: 'auto'}});

    try {
        await waitUntilExit();
    } finally {
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
        }

        screen.leave();
    }
};
