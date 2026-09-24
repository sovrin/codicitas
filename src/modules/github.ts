import {definer} from '#/services/definition';
import {isNumbered} from '#/services/references';
import {masked} from '#/utils';
import {type Answer, type Badge, type Module, Refused} from './module';

/**
 * A repository as GitHub names it.
 */
export type Repository = {
    owner: string;
    name: string;
};

/**
 * Where pull requests are looked up: the short names given to repositories,
 * and the token to ask with.
 */
export type GitHub = {
    repositories: ReadonlyMap<string, Repository>;
    token: string;
};

const API = 'https://api.github.com/graphql';

/**
 * Asking about one pull request should not hold up the others for long.
 */
const TIMEOUT = 10_000;

/**
 * A short name for a repository, the part before the # in legacy#12: it
 * starts with a letter and ends on a letter or digit.
 */
const ALIAS = /^[A-Za-z](?:[\w.-]*\w)?$/;

export const isAlias = (name: string): boolean => ALIAS.test(name);

/**
 * A repository as typed or pasted, as owner/name: sovrin/sonotas, its address
 * on github.com, or the address git clones it from. Undefined for anything
 * else.
 *
 * @param text
 */
export const repositoryOf = (text: string): string | undefined => {
    const [, owner, name] =
        /^(?:(?:https?:\/\/)?(?:www\.)?github\.com[/:]|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i.exec(
            text.trim(),
        ) ?? [];

    return owner && name ? `${owner}/${name}` : undefined;
};

/**
 * The short name to offer for a repository: its own name, as far as it makes
 * one. sovrin/sonotas becomes sonotas.
 *
 * @param repository owner/name
 */
export const suggest = (repository: string): string => {
    const name = repository.split('/').pop() ?? '';
    const cut = name
        .replace(/^[^A-Za-z]+/, '')
        .replace(/[^\w.-]/g, '')
        .replace(/[.-]+$/, '');

    return isAlias(cut) ? cut : '';
};

/**
 * The short names the journal uses before a #, each once, spelled the way
 * they were first written.
 *
 * @param topics every topic in the journal
 */
export const aliasesIn = (topics: string[]): string[] => {
    const found = new Map<string, string>();

    for (const topic of topics.filter(isNumbered)) {
        const [alias] = topic.split('#');

        if (!found.has(alias.toLowerCase())) {
            found.set(alias.toLowerCase(), alias);
        }
    }

    return [...found.values()];
};

/**
 * The repositories by short name. Names are told apart regardless of case,
 * the way GitHub tells repositories apart; a repository that is not one is
 * left out.
 *
 * @param entries short name to owner/name
 */
export const repositoriesOf = (entries: Record<string, string>): Map<string, Repository> =>
    new Map(
        Object.entries(entries).flatMap(([alias, text]) => {
            const [owner, name] = repositoryOf(text)?.split('/') ?? [];

            return isAlias(alias) && owner ? [[alias.toLowerCase(), {owner, name}] as const] : [];
        }),
    );

/**
 * GitHub as set up, or undefined while it is not: a repository and a token
 * are the least it takes. The token falls back to GITHUB_TOKEN or GH_TOKEN,
 * the variables gh and other tools read, for keeping it out of the journal.
 *
 * @param options
 * @param env
 */
export const githubOf = (
    {repositories, token}: {repositories: Record<string, string>; token: string},
    env: NodeJS.ProcessEnv = process.env,
): GitHub | undefined => {
    const known = repositoriesOf(repositories);
    const secret = token.trim() || env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || '';

    return known.size > 0 && secret ? {repositories: known, token: secret} : undefined;
};

/**
 * What legacy#12 stands for, as sovrin/sonotas#12; undefined for a short name
 * no repository was given.
 *
 * @param github
 * @param reference
 */
export const resolve = ({repositories}: GitHub, reference: string): string | undefined => {
    const [, alias, number] = /^(.+)#(\d+)$/.exec(reference) ?? [];
    const repository = alias && repositories.get(alias.toLowerCase());

    return repository ? `${repository.owner}/${repository.name}#${number}` : undefined;
};

/**
 * A resolved reference taken apart again.
 *
 * @param key like sovrin/sonotas#12
 */
const partsOf = (key: string): {owner: string; name: string; number: number} => {
    const [, owner, name, number] = /^([^/]+)\/([^#]+)#(\d+)$/.exec(key);

    return {owner, name, number: Number(number)};
};

/**
 * Pull requests and issues share their numbers, so either is asked for;
 * a pull request's checks are those of its last commit.
 */
const QUERY = `query ($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on PullRequest {
        title
        state
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
      ... on Issue { title state }
    }
  }
}`;

type Found = {
    __typename: 'PullRequest' | 'Issue';
    title: string;
    state: 'OPEN' | 'CLOSED' | 'MERGED';
    commits?: {nodes: {commit: {statusCheckRollup: {state: string} | null}}[]};
};

/**
 * How a pull request or issue stands, in a word: an open pull request by its
 * checks, anything else by whether it is still open.
 *
 * @param found
 */
export const statusOf = ({__typename, state, commits}: Found): string => {
    if (__typename === 'Issue') {
        return state === 'OPEN' ? 'open-issue' : 'closed-issue';
    }

    if (state !== 'OPEN') {
        return state === 'MERGED' ? 'merged' : 'closed';
    }

    const checks = commits?.nodes[0]?.commit.statusCheckRollup?.state;

    return (
        {SUCCESS: 'passing', FAILURE: 'failing', ERROR: 'failing', PENDING: 'running'}[checks] ??
        (checks === 'EXPECTED' ? 'running' : 'unchecked')
    );
};

/**
 * A pull request's or issue's title and how it stands, or null when GitHub
 * has no such thing - or none this token may see, which GitHub does not tell
 * apart.
 *
 * @param github
 * @param key like sovrin/sonotas#12
 * @param signal
 * @param request fetch, or a stand-in for tests
 */
export const lookup = async (
    {token}: GitHub,
    key: string,
    signal?: AbortSignal,
    request: typeof fetch = fetch,
): Promise<Answer | null> => {
    const response = await request(API, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({query: QUERY, variables: partsOf(key)}),
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)])
            : AbortSignal.timeout(TIMEOUT),
    });

    // a spent rate limit is waited out, anything else forbidden is the token
    if (
        response.status === 401 ||
        (response.status === 403 && response.headers.get('x-ratelimit-remaining') !== '0')
    ) {
        throw new Refused(`GitHub answered ${response.status}`);
    }

    if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}`);
    }

    const {data, errors = []} = (await response.json()) as {
        data?: {repository: {issueOrPullRequest: Found | null} | null};
        errors?: {type?: string; path?: (string | number)[]}[];
    };
    const found = data?.repository?.issueOrPullRequest;
    // a fine-grained token has no permission for checks: GitHub answers
    // everything else and leaves the checks out, saying so
    const unreadable = errors.some(
        ({type, path}) => type === 'FORBIDDEN' && path?.includes('statusCheckRollup'),
    );

    if (found) {
        const status = statusOf(found);

        return {
            title: found.title.trim(),
            status: unreadable && status === 'unchecked' ? 'unreadable' : status,
        };
    }

    // a repository the token may not see is one it does not know
    if (errors.some(({type}) => type !== 'NOT_FOUND' && type !== 'FORBIDDEN')) {
        throw new Error('GitHub could not answer');
    }

    return null;
};

const MINUTE = 60_000;

/**
 * An open pull request's checks change by the minute, running ones most of
 * all; whatever is closed hardly changes at all.
 *
 * @param answer
 */
const fresh = (answer: Answer | null): number =>
    // not found is often a token that may not see it yet, soon fixed
    answer === null
        ? 15 * MINUTE
        : ({
              running: MINUTE,
              passing: 3 * MINUTE,
              failing: 3 * MINUTE,
              unchecked: 3 * MINUTE,
              unreadable: 3 * MINUTE,
              'open-issue': 60 * MINUTE,
          }[answer?.status] ?? 24 * 60 * MINUTE);

/**
 * What an open pull request's checks can be, as against how a pull request or
 * issue stands otherwise.
 */
const CHECKS = new Set(['passing', 'failing', 'running', 'unchecked', 'unreadable']);

/**
 * How a pull request or issue stands, in the colours GitHub gives it.
 */
const TINTS: Record<string, string> = {
    passing: 'green',
    failing: 'green',
    running: 'green',
    unchecked: 'green',
    unreadable: 'green',
    merged: 'magenta',
    closed: 'red',
    'open-issue': 'green',
    'closed-issue': 'magenta',
};

const BADGES: Record<string, Badge> = {
    passing: {glyph: '✓', color: 'green'},
    failing: {glyph: '✗', color: 'red'},
    running: {glyph: '●', color: 'yellow'},
    unchecked: {glyph: '○', color: 'gray'},
    // the token cannot read checks, which says nothing about them
    unreadable: {glyph: '?', color: 'gray'},
    merged: {glyph: '◆', color: 'magenta'},
    closed: {glyph: '⊘', color: 'gray'},
    'open-issue': {glyph: '○', color: 'green'},
    'closed-issue': {glyph: '●', color: 'magenta'},
};

export type GitHubSettings = {
    /**
     * Whether pull requests are looked up at all.
     */
    github: boolean;
    /**
     * Short names for repositories, like legacy for sovrin/sonotas.
     */
    githubRepositories: Record<string, string>;
    githubToken: string;
    /**
     * Whether a pull request's title is shown after it.
     */
    githubTitles: boolean;
    /**
     * Whether a pull request and its title are drawn in the colour of how it
     * stands.
     */
    githubColours: 'state' | 'off';
    /**
     * Which badges are drawn: all of them, those of the checks, or none.
     */
    githubBadges: 'all' | 'checks' | 'none';
    /**
     * Minutes between looks for answers gone stale; 0 looks only when codi
     * opens and when the journal changes.
     */
    githubPoll: number;
};

const define = definer<GitHubSettings>();

/**
 * Pull requests like legacy#12, with how their checks stand before them,
 * their titles after them and a link to them.
 */
const github: Module<GitHubSettings> = {
    id: 'github',
    name: 'GitHub',
    noun: 'pull request',
    description:
        'Pull requests like legacy#12 show whether their checks pass and their title, and link to GitHub.',
    refused: 'Check the token.',
    unknown:
        "GitHub treats a repository the token may not see as one that does not exist. A fine-grained token needs the repository's owner as its resource owner, access to the repository, and the organization's approval.",
    defaults: {
        github: false,
        githubRepositories: {},
        githubToken: '',
        githubTitles: true,
        githubColours: 'state',
        githubBadges: 'all',
        githubPoll: 1,
    },
    settings: [
        define({
            id: 'githubRepositories',
            label: 'Repositories',
            description:
                'Short names for your repositories, like legacy for sovrin/sonotas. Then legacy#12 is pull request 12 of sovrin/sonotas.',
            // a few in full, more by their short names alone
            format: (entries) => {
                const list = Object.entries(entries);

                if (list.length === 0) {
                    return 'none yet';
                }

                return list.length > 2
                    ? list.map(([alias]) => alias).join(', ')
                    : list.map(([alias, repository]) => `${alias} → ${repository}`).join(', ');
            },
            missing: (entries) => repositoriesOf(entries).size === 0,
            entries: {
                name: 'short name',
                value: 'repository',
                help: {
                    value: 'The repository, like sovrin/sonotas, or its address pasted from GitHub.',
                    name: 'The short name to write before the number, like legacy for legacy#12.',
                },
                parse: repositoryOf,
                isName: isAlias,
                suggest,
                wanted: aliasesIn,
            },
        }),
        define({
            id: 'githubToken',
            label: 'Token',
            description:
                'A classic token from github.com/settings/tokens with the repo scope, or no scope at all for public repositories only. A fine-grained token cannot read checks: it shows titles, with ? for the checks. Kept in the journal; leave it empty to use GITHUB_TOKEN or GH_TOKEN, like GH_TOKEN=$(gh auth token).',
            format: (token) => {
                const from = ['GITHUB_TOKEN', 'GH_TOKEN'].find((name) => process.env[name]?.trim());

                return token ? masked(token) : from ? `from ${from}` : 'not set';
            },
            missing: (token) =>
                !token.trim() && !process.env.GITHUB_TOKEN?.trim() && !process.env.GH_TOKEN?.trim(),
            secret: true,
        }),
        define({
            id: 'githubTitles',
            label: 'Titles',
            description:
                'The title after the first mention of a pull request: legacy#12 (Fix login).',
            values: [true, false],
            format: (on) => (on ? 'shown' : 'hidden'),
            display: true,
        }),
        define({
            id: 'githubColours',
            label: 'Colours',
            description:
                'A pull request and its title in the colour of how it stands: green while open, purple once merged and red once closed; an issue green while open and purple once closed.',
            values: ['state', 'off'],
            format: (colours) => (colours === 'state' ? 'by state' : 'off'),
            display: true,
        }),
        define({
            id: 'githubBadges',
            label: 'Badges',
            description:
                'The mark before a pull request: ✓ ✗ ● ○ for its checks, ◆ once merged and ⊘ once closed, and for an issue whether it is open. Checks only leaves out all but the checks.',
            values: ['all', 'checks', 'none'],
            format: (badges) =>
                ({all: 'checks and state', checks: 'checks only', none: 'hidden'})[badges],
            display: true,
        }),
        define({
            id: 'githubPoll',
            label: 'Look again',
            description:
                'How often, while codi is open, to look for pull requests whose checks may have moved on: running checks after a minute, others after three. However this is set, r looks right away.',
            values: [1, 5, 15, 0],
            format: (minutes) =>
                minutes === 0
                    ? 'only when opened'
                    : minutes === 1
                      ? 'every minute'
                      : `every ${minutes} minutes`,
            display: true,
        }),
    ],
    matches: isNumbered,
    connect: ({githubRepositories, githubToken}, env) => {
        const found = githubOf({repositories: githubRepositories, token: githubToken}, env);

        return (
            found && {
                scope: 'github.com',
                resolve: (reference) => resolve(found, reference),
                lookup: (key, signal) => lookup(found, key, signal),
                link: (key) => {
                    const {owner, name, number} = partsOf(key);

                    // GitHub sends an issue's address on to the pull request
                    // when that is what the number is
                    return `https://github.com/${owner}/${name}/issues/${number}`;
                },
            }
        );
    },
    fresh,
    poll: ({githubPoll}) => (githubPoll > 0 ? githubPoll * MINUTE : undefined),
    badge: (status, {githubBadges}) =>
        githubBadges === 'all' || (githubBadges === 'checks' && CHECKS.has(status))
            ? BADGES[status]
            : undefined,
    titles: ({githubTitles}) => githubTitles,
    tint: (status, {githubColours}) => (githubColours === 'state' ? TINTS[status] : undefined),
};

export default github;
