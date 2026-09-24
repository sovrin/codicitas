import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {isEntries} from '#/services/definition';
import {DEFAULTS, GENERAL, normalize, SETTINGS, step} from '#/services/settings';

describe('normalize', () => {
    it('fills in whatever is missing with its default', () => {
        assert.deepEqual(normalize(), DEFAULTS);
        assert.deepEqual(normalize({gap: 45}), {...DEFAULTS, gap: 45});
    });

    it('drops values a setting does not take, and settings it does not know', () => {
        assert.deepEqual(normalize({gap: 7, tag: 'idea', hints: 'yes', colour: 'pink'}), DEFAULTS);
    });

    it('takes names given to things as an object of text, and nothing else', () => {
        const repositories = {legacy: 'sovrin/sonotas'};

        assert.deepEqual(
            normalize({githubRepositories: repositories}).githubRepositories,
            repositories,
        );
        assert.deepEqual(normalize({githubRepositories: 'legacy'}).githubRepositories, {});
        assert.deepEqual(normalize({githubRepositories: {legacy: 12}}).githubRepositories, {});
        assert.deepEqual(normalize({githubRepositories: ['a']}).githubRepositories, {});
    });

    it('takes any text for a typed setting, and nothing else', () => {
        assert.equal(normalize({jiraSite: 'acme.atlassian.net'}).jiraSite, 'acme.atlassian.net');
        assert.equal(normalize({jiraSite: 42}).jiraSite, '');
    });
});

describe('step', () => {
    it('moves through the allowed values, wrapping at either end', () => {
        assert.equal(step(DEFAULTS, 'gap', 1).gap, 45);
        assert.equal(step({...DEFAULTS, gap: 0}, 'gap', 1).gap, 15);
        assert.equal(step(DEFAULTS, 'tag', -1).tag, 'meet');
        assert.equal(step(DEFAULTS, 'quiet', 1).quiet, false);
    });

    it('leaves a typed setting alone, there being nothing to step through', () => {
        assert.deepEqual(step({...DEFAULTS, jiraSite: 'acme'}, 'jiraSite', 1), {
            ...DEFAULTS,
            jiraSite: 'acme',
        });
    });

    it('changes nothing but the one setting', () => {
        const {weekStart, ...rest} = step(DEFAULTS, 'weekStart', 1);
        const {weekStart: before, ...others} = DEFAULTS;

        assert.equal(weekStart, 'sunday');
        assert.notEqual(weekStart, before);
        assert.deepEqual(rest, others);
    });
});

describe('SETTINGS', () => {
    it('only offers defaults it allows', () => {
        for (const {id, values, entries} of SETTINGS) {
            assert.ok(
                entries
                    ? isEntries(DEFAULTS[id])
                    : values
                      ? (values as unknown[]).includes(DEFAULTS[id])
                      : typeof DEFAULTS[id] === 'string',
                id,
            );
        }
    });

    it("keeps the modules' settings apart from codicitas' own", () => {
        const general = new Set(GENERAL.map(({id}) => id));

        assert.ok(!general.has('jira'));
        assert.ok(!general.has('jiraSite'));
        assert.deepEqual(
            SETTINGS.map(({id}) => id).filter((id) => !general.has(id)),
            [
                'jira',
                'jiraSite',
                'jiraEmail',
                'jiraToken',
                'jiraTitleTemplate',
                'jiraCopyTemplate',
                'github',
                'githubRepositories',
                'githubToken',
                'githubTitles',
                'githubBadges',
                'githubPoll',
                'githubTitleTemplate',
                'githubMarkTemplate',
                'githubCopyTemplate',
            ],
        );
    });

    it('turns a module on and off', () => {
        assert.equal(step(DEFAULTS, 'jira', 1).jira, true);
        assert.equal(normalize({jira: true}).jira, true);
        assert.equal(normalize({jira: 'yes'}).jira, false);
    });

    it('never shows a token whole', () => {
        const {format} = SETTINGS.find(({id}) => id === 'jiraToken');

        assert.equal(format('' as never), 'not set');
        assert.equal(format('ATATT3xFfGF0abcd1234' as never), '••••••••1234');
        assert.equal(format('short' as never), '••••••••');
    });
});
