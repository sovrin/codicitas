import {definer} from '#/services/definition';
import {isTicket} from '#/services/references';
import {masked} from '#/utils';
import {type Answer, type Check, type Module, Refused, type Settled} from './module';
import {template} from './templates';

/**
 * Where tickets are looked up. Jira Cloud signs in with an email address and
 * an API token; Jira Server and Data Center with a personal access token
 * alone, which is what an empty email means.
 */
export type Jira = {
    /**
     * The site, like https://acme.atlassian.net, without a trailing slash.
     */
    site: string;
    email: string;
    token: string;
};

/**
 * Asking about one ticket should not hold up the others for long.
 */
const TIMEOUT = 10_000;

/**
 * The site as typed, made into something to send requests to: https unless
 * said otherwise, and no trailing slash to double up.
 *
 * @param site
 */
export const toSite = (site: string): string => {
    const trimmed = site.trim().replace(/\/+$/, '');

    if (!trimmed) {
        return '';
    }

    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

type Options = {
    site: string;
    email: string;
    token: string;
};

/**
 * Jira as set up, or undefined while it is not: a site and a token are the
 * least it takes. The token falls back to JIRA_API_TOKEN, the variable other
 * Jira tools read, for keeping it out of the journal.
 *
 * @param settings
 * @param env
 */
export const jiraOf = (
    {site, email, token}: Options,
    env: NodeJS.ProcessEnv = process.env,
): Jira | undefined => {
    const url = toSite(site);
    const secret = token.trim() || env.JIRA_API_TOKEN?.trim() || '';

    return url && secret ? {site: url, email: email.trim(), token: secret} : undefined;
};

const authorization = ({email, token}: Jira): string =>
    email ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` : `Bearer ${token}`;

/**
 * Asks Jira's API, signed in. A sign in turned down throws Refused, whatever
 * else went wrong an Error; a ticket that is not there is left to the caller.
 *
 * @param jira
 * @param path like /rest/api/2/myself
 * @param signal
 * @param request
 */
const get = async (
    jira: Jira,
    path: string,
    signal: AbortSignal | undefined,
    request: typeof fetch,
): Promise<Response> => {
    const response = await request(`${jira.site}${path}`, {
        headers: {
            Accept: 'application/json',
            Authorization: authorization(jira),
        },
        signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)])
            : AbortSignal.timeout(TIMEOUT),
    });

    if (response.status === 401 || response.status === 403) {
        throw new Refused(`Jira answered ${response.status}`);
    }

    if (!response.ok && response.status !== 404) {
        throw new Error(`Jira answered ${response.status}`);
    }

    return response;
};

/**
 * Resolutions that say the work was not done but given up on, as Jira and
 * its usual workflows name them.
 */
const DROPPED = new Set([
    "won't do",
    "won't fix",
    'wont do',
    'wontfix',
    'duplicate',
    'cannot reproduce',
    "can't reproduce",
    'declined',
    'rejected',
    'invalid',
    'obsolete',
    'incomplete',
    'abandoned',
    'not a bug',
]);

type Fields = {
    summary?: unknown;
    status?: {statusCategory?: {key?: unknown}};
    resolution?: {name?: unknown} | null;
};

/**
 * How a ticket stands, in a word: open until its status is one of the done
 * ones, and then done - or dropped, when it was resolved as not to be done.
 *
 * @param fields
 */
export const statusOf = ({status, resolution}: Fields): 'open' | 'done' | 'dropped' => {
    if (status?.statusCategory?.key !== 'done') {
        return 'open';
    }

    const name = typeof resolution?.name === 'string' ? resolution.name : '';

    return DROPPED.has(name.trim().toLowerCase().replaceAll('’', "'")) ? 'dropped' : 'done';
};

/**
 * A ticket's title and how it stands, or null when Jira has no such ticket -
 * or none this account may see, which Jira does not tell apart. Anything that
 * looks like a ticket is asked about, so UTF-8 simply comes back null.
 *
 * @param jira
 * @param key
 * @param signal
 * @param request fetch, or a stand-in for tests
 */
export const lookup = async (
    jira: Jira,
    key: string,
    signal?: AbortSignal,
    request: typeof fetch = fetch,
): Promise<Answer | null> => {
    const response = await get(
        jira,
        `/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,status,resolution`,
        signal,
        request,
    );

    if (response.status === 404) {
        return null;
    }

    const {fields} = (await response.json()) as {fields?: Fields};

    return typeof fields?.summary === 'string' && fields.summary.trim()
        ? {title: fields.summary.trim(), status: statusOf(fields)}
        : null;
};

/**
 * Who the sign in belongs to: the account Jira says it is, on Cloud and on
 * Server alike. A site that is not a Jira has no such thing to say.
 *
 * @param jira
 * @param signal
 * @param request fetch, or a stand-in for tests
 */
export const check = async (
    jira: Jira,
    signal?: AbortSignal,
    request: typeof fetch = fetch,
): Promise<Check> => {
    const response = await get(jira, '/rest/api/2/myself', signal, request);
    const found = response.ok
        ? ((await response.json().catch(() => ({}))) as Record<string, unknown>)
        : {};
    const account = [found.displayName, found.name, found.emailAddress].find(
        (name) => typeof name === 'string' && name.trim(),
    );

    if (typeof account !== 'string') {
        throw new Error(`${jira.site} did not answer as Jira does`);
    }

    return {account: account.trim(), unseen: []};
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * An open ticket is looked at again after a day, one that is done after a
 * week. A title kept from before tickets had a status is asked for again at
 * once, for its status.
 *
 * @param answer
 */
const fresh = (answer: Answer | null): number =>
    answer === null
        ? 7 * DAY
        : answer.status === undefined
          ? 0
          : answer.status === 'open'
            ? DAY
            : 7 * DAY;

const SETTLED: Record<string, Settled> = {done: 'done', dropped: 'dropped'};

export type JiraSettings = {
    /**
     * Whether tickets are looked up at all.
     */
    jira: boolean;
    /**
     * The Jira tickets are looked up in; empty leaves them as written.
     */
    jiraSite: string;
    /**
     * The account a Jira Cloud API token belongs to. Empty on Jira Server and
     * Data Center, where a personal access token is enough.
     */
    jiraEmail: string;
    jiraToken: string;
    /**
     * How a ticket's title is written on screen and in the copied standup;
     * empty for the defaults.
     */
    jiraTitleTemplate: string;
    jiraCopyTemplate: string;
};

/**
 * A ticket as the templates' previews show one.
 */
const EXAMPLE = {
    ref: 'ACME-4217',
    title: 'Download times out',
    link: 'https://acme.atlassian.net/browse/ACME-4217',
};

const define = definer<JiraSettings>();

/**
 * Tickets like PROJ-123, with their titles after them and a link to them.
 */
const jira: Module<JiraSettings> = {
    id: 'jira',
    name: 'Jira',
    noun: 'ticket',
    description: 'Tickets like PROJ-123 show their title after them, and link to Jira.',
    refused: 'Check the email and token.',
    unknown: 'Check the tickets exist, and that the account may see their projects.',
    defaults: {
        jira: false,
        jiraSite: '',
        jiraEmail: '',
        jiraToken: '',
        jiraTitleTemplate: '',
        jiraCopyTemplate: '',
    },
    settings: [
        define({
            id: 'jiraSite',
            label: 'Site',
            description:
                'Your Jira, like acme.atlassian.net. Tickets like PROJ-123 then show their title after them.',
            format: (site) => site || 'not set',
            missing: (site) => !site.trim(),
        }),
        define({
            id: 'jiraEmail',
            label: 'Email',
            description:
                'Who the API token belongs to, on Jira Cloud. Leave it empty on Jira Server or Data Center, where a personal access token is enough.',
            format: (email) => email || 'not set',
        }),
        define({
            id: 'jiraToken',
            label: 'Token',
            description:
                'An API token from id.atlassian.com, or a personal access token. Kept in the journal; leave it empty to use JIRA_API_TOKEN instead.',
            format: (token) =>
                token
                    ? masked(token)
                    : process.env.JIRA_API_TOKEN
                      ? 'from JIRA_API_TOKEN'
                      : 'not set',
            missing: (token) => !token.trim() && !process.env.JIRA_API_TOKEN?.trim(),
            secret: true,
        }),
        template<JiraSettings>('title', 'jiraTitleTemplate', EXAMPLE),
        template<JiraSettings>('copy', 'jiraCopyTemplate', EXAMPLE),
    ],
    templates: {title: 'jiraTitleTemplate', copy: 'jiraCopyTemplate'},
    matches: isTicket,
    fresh,
    // done tickets fade, dropped ones are struck through as well
    settled: (status) => SETTLED[status],
    connect: ({jiraSite, jiraEmail, jiraToken}, env) => {
        const found = jiraOf({site: jiraSite, email: jiraEmail, token: jiraToken}, env);

        return (
            found && {
                scope: found.site,
                lookup: (key, signal) => lookup(found, key, signal),
                check: (signal) => check(found, signal),
                link: (key) => `${found.site}/browse/${key}`,
            }
        );
    },
};

export default jira;
