import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {enter, isSupported, leave} from '#/services/screen';

describe('screen', () => {
    it('stays out of the way when output is not a terminal', () => {
        // the test runner's stdout is a pipe, so nothing may be emitted: escape
        // codes would end up in whatever the output is piped into
        assert.equal(isSupported(), false);

        const written: string[] = [];
        const {write} = process.stdout;

        process.stdout.write = ((chunk: string) => {
            written.push(String(chunk));

            return true;
        }) as typeof process.stdout.write;

        try {
            enter();
            leave();
        } finally {
            process.stdout.write = write;
        }

        assert.deepEqual(written, []);
    });

    it('does not restore a screen it never entered', () => {
        // leave() runs from several exit paths, so it has to be harmless
        assert.doesNotThrow(() => {
            leave();
            leave();
        });
    });
});
