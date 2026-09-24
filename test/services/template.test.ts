import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {around, placeholders, render} from '#/services/template';

describe('render', () => {
    it('fills in placeholders, leaving out those without a value', () => {
        assert.equal(render('{ref}[{title}]', {ref: 'ACME-1', title: 'Crash'}), 'ACME-1[Crash]');
        assert.equal(render('{ref}[{title}]', {ref: 'ACME-1'}), 'ACME-1[]');
        assert.equal(render('no placeholders', {}), 'no placeholders');
    });

    it('writes braces written twice as themselves', () => {
        assert.equal(render('{{{ref}}}', {ref: 'x'}), '{x}');
    });
});

describe('placeholders', () => {
    it('lists the placeholders a template uses, each once', () => {
        assert.deepEqual(placeholders('[{ref}]({link}) {title} {ref} {{not}}'), [
            'ref',
            'link',
            'title',
        ]);
    });
});

describe('around', () => {
    it('fills in what comes before one placeholder and after it', () => {
        assert.deepEqual(around('{title}: {ref}!', 'ref', {title: 'Crash'}), ['Crash: ', '!']);
        assert.deepEqual(around('{ref}[{title}]', 'ref', {title: 'Crash'}), ['', '[Crash]']);
    });

    it('puts everything after a reference whose template leaves it out', () => {
        assert.deepEqual(around(' ({title})', 'ref', {title: 'Crash'}), ['', ' (Crash)']);
    });
});
