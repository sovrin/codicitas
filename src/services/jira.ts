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
 * Jira answered, but would not say: the token is wrong, expired or lacks
 * access. Asking again with the same token will not help.
 */
export class Refused extends Error {}

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
 * A ticket's title, or null when Jira has no such ticket - or none this
 * account may see, which Jira does not tell apart. Anything that looks like a
 * ticket is asked about, so UTF-8 simply comes back null.
 *
 * @param jira
 * @param key
 * @param signal
 * @param request fetch, or a stand-in for tests
 */
export const title = async (
    jira: Jira,
    key: string,
    signal?: AbortSignal,
    request: typeof fetch = fetch,
): Promise<string | null> => {
    const response = await request(
        `${jira.site}/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary`,
        {
            headers: {
                Accept: 'application/json',
                Authorization: authorization(jira),
            },
            signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT)])
                : AbortSignal.timeout(TIMEOUT),
        },
    );

    if (response.status === 401 || response.status === 403) {
        throw new Refused(`Jira answered ${response.status}`);
    }

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`Jira answered ${response.status}`);
    }

    const {fields} = (await response.json()) as {fields?: {summary?: unknown}};

    return typeof fields?.summary === 'string' && fields.summary.trim()
        ? fields.summary.trim()
        : null;
};
