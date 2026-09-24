#!/usr/bin/env node
import {command} from '#/commands';

const result = await command(process.argv.slice(2));

if (result) {
    (result.code === 0 ? process.stdout : process.stderr).write(`${result.text}\n`);
    process.exit(result.code);
}

const {start} = await import('#/tui');

await start();
