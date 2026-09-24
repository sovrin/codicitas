import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    firstPerson,
    firstReference,
    isNumbered,
    isTicket,
    mentionsIn,
    references,
    topicsIn,
} from '#/services/references';

const marked = (text: string) =>
    references(text)
        .filter(({isReference}) => isReference)
        .map((part) => part.text);

describe('references', () => {
    it('finds topics, issue numbers and tickets', () => {
        assert.deepEqual(marked('#auth: review PR #412 for PROJ-123 and OPS2-7'), [
            '#auth',
            '#412',
            'PROJ-123',
            'OPS2-7',
        ]);
    });

    it("finds a repository's pull requests by its short name", () => {
        assert.deepEqual(marked('merged legacy#12, then web-app#3 and api.v2#40.'), [
            'legacy#12',
            'web-app#3',
            'api.v2#40',
        ]);
    });

    it('leaves the anchors of links and addresses as text', () => {
        assert.deepEqual(
            marked('see example.com/page#12, a.b#12 is fine, me@legacy#12 and legacy#12a'),
            ['a.b#12'],
        );
    });

    it('draws a note in its own colour', () => {
        assert.deepEqual(references('✓legacy#12', [{start: 0, end: 1, color: 'green'}]), [
            {text: '✓', isReference: false, isNote: true, color: 'green'},
            {text: 'legacy#12', isReference: true},
        ]);
    });

    it('leaves lookalikes as text', () => {
        assert.deepEqual(
            marked('C# is fine, ## is a heading, lower-12 and A-B are not tickets'),
            [],
        );
    });

    it('keeps every character, in order', () => {
        const text = 'see #auth, then PROJ-1.';

        assert.equal(
            references(text)
                .map((part) => part.text)
                .join(''),
            text,
        );
    });

    it('names the first one to search for', () => {
        assert.equal(firstReference('ship PROJ-9 after #auth'), 'PROJ-9');
        assert.equal(firstReference('nothing to follow'), undefined);
    });
});

describe('people', () => {
    it('finds colleagues among topics and tickets, in order', () => {
        assert.deepEqual(
            marked('paired with @anna on #auth, then @jan-erik and @anna.k on PROJ-9'),
            ['@anna', '#auth', '@jan-erik', '@anna.k', 'PROJ-9'],
        );
    });

    it('leaves times, email addresses and trailing punctuation alone', () => {
        assert.deepEqual(marked('@10:30 mail anna@example.com'), []);
        assert.deepEqual(marked('thanks @anna.'), ['@anna']);
        assert.deepEqual(marked('@9am with @Bo'), ['@Bo']);
    });

    it('names the first colleague to search for, apart from topics', () => {
        assert.equal(firstPerson('#auth with @anna and @bo'), '@anna');
        assert.equal(firstReference('#auth with @anna'), '#auth');
        assert.equal(firstPerson('#auth alone'), undefined);
    });
});

describe('mentionsIn', () => {
    it('lists each colleague and topic once, tickets among the topics', () => {
        assert.deepEqual(mentionsIn('@anna and @bo on #auth, @anna again for PROJ-7'), [
            {kind: 'person', name: '@anna'},
            {kind: 'person', name: '@bo'},
            {kind: 'topic', name: '#auth'},
            {kind: 'topic', name: 'PROJ-7'},
        ]);
    });
});

describe('notes', () => {
    it('keeps notes apart, and finds no references inside them', () => {
        const text = 'fix ACME-1 (see OPS-2) for @anna';

        assert.deepEqual(
            references(text, [{start: 10, end: 22}]).map((part) => [
                part.text,
                part.isReference,
                part.isNote ?? false,
            ]),
            [
                ['fix ', false, false],
                ['ACME-1', true, false],
                [' (see OPS-2)', false, true],
                [' for ', false, false],
                ['@anna', true, false],
            ],
        );
    });

    it('counts in code points, so an emoji before a note does not shift it', () => {
        assert.deepEqual(
            references('🚀 XY-1 (t)', [{start: 6, end: 10}]).map((part) => part.text),
            ['🚀 ', 'XY-1', ' (t)'],
        );
    });
});

describe('isTicket', () => {
    it('tells tickets from other topics', () => {
        assert.equal(isTicket('ACME-4217'), true);
        assert.equal(isTicket('#auth'), false);
        assert.equal(isTicket('ACME-4217x'), false);
    });
});

describe('topicsIn', () => {
    it('lists the topics of several texts once each, tickets among them, people left out', () => {
        assert.deepEqual(topicsIn('ACME-1 and #auth with @anna', 'OPS-2, ACME-1 again, #412'), [
            'ACME-1',
            '#auth',
            'OPS-2',
            '#412',
        ]);
        assert.deepEqual(topicsIn('nothing here'), []);
    });
});

describe('isNumbered', () => {
    it("tells a repository's pull requests from other topics", () => {
        assert.equal(isNumbered('legacy#12'), true);
        assert.equal(isNumbered('#12'), false);
        assert.equal(isNumbered('ACME-12'), false);
    });
});
