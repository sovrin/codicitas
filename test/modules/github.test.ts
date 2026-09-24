import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import github, {
    aliasesIn,
    githubOf,
    lookup,
    repositoriesOf,
    repositoryOf,
    resolve,
    statusOf,
    suggest,
} from '#/modules/github';
import {Refused} from '#/modules/module';

const GITHUB = {
    repositories: new Map([['legacy', {owner: 'sovrin', name: 'sonotas'}]]),
    token: 'secret',
};

const answer = (status: number, body: unknown = {}, headers: Record<string, string> = {}) => {
    const calls: {url: string; init: RequestInit}[] = [];
    const request = (async (url: string, init: RequestInit) => {
        calls.push({url, init});

        return new Response(JSON.stringify(body), {status, headers});
    }) as unknown as typeof fetch;

    return {calls, request};
};

const pull = (state: string, checks?: string) => ({
    data: {
        repository: {
            issueOrPullRequest: {
                __typename: 'PullRequest',
                title: ' Fix login ',
                state,
                commits: {
                    nodes: [{commit: {statusCheckRollup: checks ? {state: checks} : null}}],
                },
            },
        },
    },
});

const of = (state: string, checks?: string) =>
    statusOf(pull(state, checks).data.repository.issueOrPullRequest as never);

describe('repositoryOf', () => {
    it('reads a repository as typed, or pasted from GitHub or git', () => {
        assert.equal(repositoryOf(' sovrin/sonotas '), 'sovrin/sonotas');
        assert.equal(repositoryOf('https://github.com/sovrin/sonotas'), 'sovrin/sonotas');
        assert.equal(repositoryOf('github.com/sovrin/sonotas/pull/12'), 'sovrin/sonotas');
        assert.equal(repositoryOf('https://github.com/sovrin/sonotas.git'), 'sovrin/sonotas');
        assert.equal(repositoryOf('git@github.com:sovrin/sonotas.git'), 'sovrin/sonotas');
        assert.equal(repositoryOf('sonotas'), undefined);
        assert.equal(repositoryOf('legacy -> sovrin/sonotas'), undefined);
        assert.equal(repositoryOf(''), undefined);
    });
});

describe('suggest', () => {
    it("offers the repository's own name, as far as it makes a short name", () => {
        assert.equal(suggest('sovrin/sonotas'), 'sonotas');
        assert.equal(suggest('acme/web-app.'), 'web-app');
        assert.equal(suggest('acme/2fa'), 'fa');
        assert.equal(suggest('acme/---'), '');
    });
});

describe('aliasesIn', () => {
    it('lists the short names the journal uses, each once, as first written', () => {
        assert.deepEqual(aliasesIn(['legacy#12', '#auth', 'Legacy#3', 'api#4', 'ACME-1']), [
            'legacy',
            'api',
        ]);
    });
});

describe('repositoriesOf', () => {
    it('keys the repositories by short name regardless of case, leaving out what is not one', () => {
        assert.deepEqual(
            [
                ...repositoriesOf({
                    legacy: 'sovrin/sonotas',
                    API: 'sovrin/api',
                    bad: 'nope',
                    '9x': 'a/b',
                }),
            ],
            [
                ['legacy', {owner: 'sovrin', name: 'sonotas'}],
                ['api', {owner: 'sovrin', name: 'api'}],
            ],
        );
    });
});

describe('githubOf', () => {
    it('needs a repository and a token, the token falling back to the environment', () => {
        const one = {a: 'b/c'};

        assert.equal(githubOf({repositories: {}, token: 'x'}, {}), undefined);
        assert.equal(githubOf({repositories: one, token: ''}, {}), undefined);
        assert.equal(githubOf({repositories: one, token: ''}, {GH_TOKEN: 'gh'}).token, 'gh');
        assert.equal(
            githubOf({repositories: one, token: ''}, {GITHUB_TOKEN: 'env', GH_TOKEN: 'gh'}).token,
            'env',
        );
    });
});

describe('resolve', () => {
    it('turns a short name into its repository, whatever its case', () => {
        assert.equal(resolve(GITHUB, 'legacy#12'), 'sovrin/sonotas#12');
        assert.equal(resolve(GITHUB, 'Legacy#12'), 'sovrin/sonotas#12');
        assert.equal(resolve(GITHUB, 'other#12'), undefined);
    });
});

describe('statusOf', () => {
    it('tells an open pull request by its checks, anything else by whether it is open', () => {
        assert.equal(of('OPEN', 'SUCCESS'), 'passing');
        assert.equal(of('OPEN', 'FAILURE'), 'failing');
        assert.equal(of('OPEN', 'ERROR'), 'failing');
        assert.equal(of('OPEN', 'PENDING'), 'running');
        assert.equal(of('OPEN'), 'unchecked');
        assert.equal(of('MERGED', 'FAILURE'), 'merged');
        assert.equal(of('CLOSED'), 'closed');
        assert.equal(statusOf({__typename: 'Issue', title: 'x', state: 'OPEN'}), 'open-issue');
    });
});

describe('lookup', () => {
    it('asks for the pull request of the repository, signing in with the token', async () => {
        const {calls, request} = answer(200, pull('OPEN', 'SUCCESS'));

        assert.deepEqual(await lookup(GITHUB, 'sovrin/sonotas#12', undefined, request), {
            title: 'Fix login',
            status: 'passing',
        });
        assert.equal(calls[0].url, 'https://api.github.com/graphql');
        assert.equal(
            (calls[0].init.headers as Record<string, string>).Authorization,
            'Bearer secret',
        );
        assert.deepEqual(JSON.parse(calls[0].init.body as string).variables, {
            owner: 'sovrin',
            name: 'sonotas',
            number: 12,
        });
    });

    it('says null for what GitHub does not know', async () => {
        const missing = {data: {repository: null as unknown}, errors: [{type: 'NOT_FOUND'}]};

        assert.equal(await lookup(GITHUB, 'a/b#1', undefined, answer(200, missing).request), null);
    });

    it('says so when the token may not read the checks, rather than that there are none', async () => {
        const body = {
            ...pull('OPEN'),
            errors: [
                {
                    type: 'FORBIDDEN',
                    path: [
                        'repository',
                        'issueOrPullRequest',
                        'commits',
                        'nodes',
                        0,
                        'commit',
                        'statusCheckRollup',
                    ],
                },
            ],
        };

        assert.deepEqual(await lookup(GITHUB, 'a/b#1', undefined, answer(200, body).request), {
            title: 'Fix login',
            status: 'unreadable',
        });
        assert.deepEqual(github.badge('unreadable', github.defaults), {glyph: '?', color: 'gray'});
    });

    it('takes a repository the token may not see for one GitHub does not know', async () => {
        const hidden = {data: {repository: null as unknown}, errors: [{type: 'FORBIDDEN'}]};

        assert.equal(await lookup(GITHUB, 'a/b#1', undefined, answer(200, hidden).request), null);
    });

    it('tells a refused token apart from a spent rate limit and anything else', async () => {
        await assert.rejects(lookup(GITHUB, 'a/b#1', undefined, answer(401).request), Refused);
        await assert.rejects(lookup(GITHUB, 'a/b#1', undefined, answer(403).request), Refused);
        await assert.rejects(
            lookup(
                GITHUB,
                'a/b#1',
                undefined,
                answer(403, {}, {'x-ratelimit-remaining': '0'}).request,
            ),
            (reason) => !(reason instanceof Refused),
        );
        await assert.rejects(
            lookup(GITHUB, 'a/b#1', undefined, answer(200, {errors: [{type: 'INTERNAL'}]}).request),
            (reason) => !(reason instanceof Refused),
        );
    });
});

describe('the GitHub module', () => {
    const settings = {
        ...github.defaults,
        github: true,
        githubRepositories: {legacy: 'sovrin/sonotas'},
        githubToken: 'x',
    };

    it('knows pull requests by short name, and no other topics', () => {
        assert.equal(github.matches('legacy#12'), true);
        assert.equal(github.matches('#12'), false);
        assert.equal(github.matches('ACME-12'), false);
    });

    it('keeps pull requests by repository, and links to them', () => {
        const source = github.connect(settings, {});

        assert.equal(source.resolve('legacy#12'), 'sovrin/sonotas#12');
        assert.equal(
            source.link('sovrin/sonotas#12'),
            'https://github.com/sovrin/sonotas/issues/12',
        );
    });

    it('asks again about what it did not find within a quarter of an hour', () => {
        assert.equal(github.fresh(null), 15 * 60_000);
    });

    it('asks again about running checks within a minute, merged ones a day later', () => {
        assert.equal(github.fresh({title: 'x', status: 'running'}), 60_000);
        assert.equal(github.fresh({title: 'x', status: 'merged'}), 24 * 60 * 60_000);
    });

    it('looks again as often as set, or only when opened', () => {
        assert.equal(github.poll(github.defaults), 60_000);
        assert.equal(github.poll({...github.defaults, githubPoll: 15}), 15 * 60_000);
        assert.equal(github.poll({...github.defaults, githubPoll: 0}), undefined);
    });

    it('draws how the checks stand', () => {
        assert.deepEqual(github.badge('passing', github.defaults), {glyph: '✓', color: 'green'});
        assert.deepEqual(github.badge('failing', github.defaults), {glyph: '✗', color: 'red'});
        assert.deepEqual(github.badge('merged', github.defaults), {glyph: '◆', color: 'magenta'});
        assert.equal(github.badge('nonsense', github.defaults), undefined);
    });

    it('draws only the badges it is set to', () => {
        const checks = {...github.defaults, githubBadges: 'checks' as const};
        const none = {...github.defaults, githubBadges: 'none' as const};

        assert.deepEqual(github.badge('running', checks), {glyph: '●', color: 'yellow'});
        assert.equal(github.badge('merged', checks), undefined);
        assert.equal(github.badge('open-issue', checks), undefined);
        assert.equal(github.badge('passing', none), undefined);
    });

    it('shows titles unless they are turned off', () => {
        assert.equal(github.titles(github.defaults), true);
        assert.equal(github.titles({...github.defaults, githubTitles: 'plain'}), true);
        assert.equal(github.titles({...github.defaults, githubTitles: 'hidden'}), false);
    });

    it('colours titles by how things stand, unless they are plain', () => {
        const plain = {...github.defaults, githubTitles: 'plain' as const};

        assert.equal(github.tint('failing', github.defaults), 'green');
        assert.equal(github.tint('merged', github.defaults), 'magenta');
        assert.equal(github.tint('closed', github.defaults), 'red');
        assert.equal(github.tint('closed-issue', github.defaults), 'magenta');
        assert.equal(github.tint('merged', plain), undefined);
    });

    it('needs repositories and a token, the token counting as there in the environment', () => {
        const repositories = github.settings.find(({id}) => id === 'githubRepositories');
        const token = github.settings.find(({id}) => id === 'githubToken');
        const before = {GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN};

        assert.equal(repositories.missing({} as never), true);
        assert.equal(repositories.missing({legacy: 'sovrin/sonotas'} as never), false);

        try {
            delete process.env.GITHUB_TOKEN;
            delete process.env.GH_TOKEN;
            assert.equal(token.missing('' as never), true);
            assert.equal(token.format('' as never), 'not set');

            process.env.GH_TOKEN = 'from-gh';
            assert.equal(token.missing('' as never), false);
            assert.equal(token.format('' as never), 'from GH_TOKEN');
            assert.equal(token.format('ghp_abcdefghijkl1234' as never), '••••••••1234');
        } finally {
            for (const [name, value] of Object.entries(before)) {
                if (value === undefined) {
                    delete process.env[name];
                } else {
                    process.env[name] = value;
                }
            }
        }
    });

    it('marks its settings of what is shown, so changing them does not start over', () => {
        const display = github.settings
            .filter((definition) => definition.display)
            .map(({id}) => id);

        assert.deepEqual(display, ['githubTitles', 'githubBadges', 'githubPoll']);
    });
});
