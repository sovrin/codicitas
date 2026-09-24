import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {candidates, complete, ghost, tokenAt} from '#/services/completion';

const at = (buffer: string, cursor = [...buffer].length) => ({buffer, cursor});

describe('tokenAt', () => {
    it('finds the name or topic being typed right behind the cursor', () => {
        assert.deepEqual(tokenAt(at('paired with @an')), {kind: 'person', typed: '@an', start: 12});
        assert.deepEqual(tokenAt(at('see #au')), {kind: 'topic', typed: '#au', start: 4});
    });

    it('offers everyone on a bare @ or #', () => {
        assert.deepEqual(tokenAt(at('with @')), {kind: 'person', typed: '@', start: 5});
    });

    it('stays out of times, email addresses and the middle of a word', () => {
        assert.equal(tokenAt(at('@10')), undefined);
        assert.equal(tokenAt(at('mail anna@ex')), undefined);
        assert.equal(tokenAt(at('with @anna later', 8)), undefined);
        assert.equal(tokenAt(at('nothing here')), undefined);
    });

    it('works with the cursor before the rest of the line', () => {
        assert.deepEqual(tokenAt(at('with @an on #auth', 8)), {
            kind: 'person',
            typed: '@an',
            start: 5,
        });
    });
});

describe('candidates', () => {
    const people = ['@anna', '@anton', '@Andre', '@bo'];

    it('keeps the order given, ignoring case', () => {
        assert.deepEqual(candidates({kind: 'person', typed: '@an', start: 0}, people), [
            '@anna',
            '@anton',
            '@Andre',
        ]);
        assert.deepEqual(candidates({kind: 'person', typed: '@AN', start: 0}, people), [
            '@anna',
            '@anton',
            '@Andre',
        ]);
    });

    it('does not offer what is typed out already', () => {
        assert.deepEqual(candidates({kind: 'person', typed: '@anna', start: 0}, people), []);
    });

    it('offers at most a handful', () => {
        assert.equal(candidates({kind: 'person', typed: '@', start: 0}, people, 2).length, 2);
    });
});

describe('complete', () => {
    it('replaces the token and adds a space', () => {
        const token = tokenAt(at('with @an'));

        assert.equal(ghost(token, '@anna'), 'na');
        assert.deepEqual(complete(at('with @an'), token, '@anna'), at('with @anna '));
    });

    it('steps over a space that is already there', () => {
        const draft = at('with @an on #auth', 8);

        assert.deepEqual(complete(draft, tokenAt(draft), '@anna'), {
            buffer: 'with @anna on #auth',
            cursor: 11,
        });
    });
});
