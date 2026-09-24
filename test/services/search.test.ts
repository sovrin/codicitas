import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {highlight, isEmpty, parse, snippet} from '#/services/search';

describe('parse', () => {
    it('splits words, lower cased', () => {
        assert.deepEqual(parse('  Flaky  LOGIN '), {tag: undefined, terms: ['flaky', 'login']});
    });

    it('narrows by a leading /tag, alone or with words', () => {
        assert.deepEqual(parse('/todo'), {tag: 'todo', terms: []});
        assert.deepEqual(parse('/b staging'), {tag: 'blocked', terms: ['staging']});
    });

    it('narrows by a !priority too, in either order with a tag', () => {
        assert.deepEqual(parse('/todo !c'), {tag: 'todo', priority: 4, terms: []});
        assert.deepEqual(parse('!h /todo deploy'), {tag: 'todo', priority: 3, terms: ['deploy']});
        assert.equal(isEmpty(parse('!c')), false);
    });

    it('searches for a path rather than mistaking it for a tag', () => {
        assert.deepEqual(parse('/etc/hosts'), {tag: undefined, terms: ['/etc/hosts']});
    });

    it('knows when there is nothing to look for', () => {
        assert.equal(isEmpty(parse('   ')), true);
        assert.equal(isEmpty(parse('/done')), false);
    });
});

describe('snippet', () => {
    it('shows the first line that matches', () => {
        assert.equal(
            snippet('fixed login\n  root cause: shared mock', ['mock']),
            'root cause: shared mock',
        );
    });

    it('falls back to the first line', () => {
        assert.equal(snippet('one\ntwo', []), 'one');
    });
});

describe('highlight', () => {
    it('marks every occurrence, ignoring case', () => {
        assert.deepEqual(highlight('Mock the mock', ['mock']), [
            {text: 'Mock', isMatch: true},
            {text: ' the ', isMatch: false},
            {text: 'mock', isMatch: true},
        ]);
    });

    it('prefers the longer term where two start together', () => {
        assert.deepEqual(highlight('login', ['log', 'login']), [{text: 'login', isMatch: true}]);
    });

    it('leaves a line without matches whole', () => {
        assert.deepEqual(highlight('nothing here', ['x']), [
            {text: 'nothing here', isMatch: false},
        ]);
    });
});
