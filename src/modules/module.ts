import type {Definition} from '#/services/definition';
import type {Templates} from '#/services/template';

/**
 * The service answered, but would not say: the token is wrong, expired or
 * lacks access. Asking again with the same token will not help.
 */
export class Refused extends Error {}

/**
 * What a module found out about a reference.
 */
export type Answer = {
    title: string;
    /**
     * What else it makes of it, in a word, like whether a pull request's
     * checks pass. Kept with the title, and drawn as a badge before the
     * reference.
     */
    status?: string;
};

/**
 * How something a reference points at was finished with: done, or dropped.
 */
export type Settled = 'done' | 'dropped';

/**
 * A mark drawn right before a reference, like ✓ for passing checks.
 */
export type Badge = {
    glyph: string;
    color?: string;
};

/**
 * What a module found out about its sign in.
 */
export type Check = {
    /**
     * Who the sign in belongs to, as the service names them.
     */
    account: string;
    /**
     * What it was set up with that the sign in cannot see, like a repository
     * the token has no access to.
     */
    unseen: string[];
};

/**
 * A module set up and ready to be asked.
 */
export type Source = {
    /**
     * What its answers are kept under, like the Jira site, so that pointing
     * the module somewhere else starts over.
     */
    scope: string;
    /**
     * What a reference is kept and asked about under, like legacy#12 as
     * sovrin/sonotas#12; undefined for one this setup has nothing to ask
     * about. The reference as written when missing.
     */
    resolve?: (reference: string) => string | undefined;
    /**
     * What there is to know about a reference, or null when there is no such
     * thing. Throws Refused when the sign in is turned down, anything else
     * when the service could not be asked.
     *
     * @param key the reference, resolved
     */
    lookup: (key: string, signal?: AbortSignal) => Promise<Answer | null>;
    /**
     * Whether the sign in works, asked without a reference, so it can be told
     * before anything is written. Throws as lookup does.
     */
    check: (signal?: AbortSignal) => Promise<Check>;
    /**
     * Where the reference can be opened.
     *
     * @param key the reference, resolved
     */
    link: (key: string) => string;
};

/**
 * Something that knows more about some of the references in an entry, like
 * Jira about tickets: it adds their titles after them and makes them links.
 * Each can be turned on and off, and comes with the settings it needs.
 */
export type Module<S = Record<string, unknown>> = {
    /**
     * Also the on/off setting that turns it on.
     */
    id: keyof S & string;
    /**
     * As said to the user, like Jira.
     */
    name: string;
    /**
     * What it calls the references it knows about, like ticket.
     */
    noun: string;
    /**
     * What turning it on does, shown with its on/off setting.
     */
    description: string;
    /**
     * What to check when the sign in is turned down.
     */
    refused: string;
    /**
     * What to check when references are not found, which is often what a
     * sign in that may not see them looks like.
     */
    unknown: string;
    /**
     * Its on/off setting and the rest of its settings, as they start out.
     */
    defaults: S;
    /**
     * Its settings apart from the on/off one, listed while it is on.
     */
    settings: Definition<S>[];
    /**
     * Whether a reference as written is one it can say more about.
     */
    matches: (reference: string) => boolean;
    /**
     * The module as set up, or undefined while something it needs is missing.
     */
    connect: (settings: S, env?: NodeJS.ProcessEnv) => Source | undefined;
    /**
     * How long an answer is trusted before it is asked for again, null being
     * the answer for a reference the module did not know; a week when
     * missing.
     */
    fresh?: (answer: Answer | null) => number;
    /**
     * How often, while codi is open, to look for answers that are no longer
     * fresh, as set up. Without it, or undefined, they are only looked for
     * when codi opens and when the journal changes.
     */
    poll?: (settings: S) => number | undefined;
    /**
     * The badge a reference with this status gets, as set up, if any: the
     * colour of its underline, or in colour-blind mode its mark after it.
     */
    badge?: (status: string, settings: S) => Badge | undefined;
    /**
     * Whether titles are shown after the references, as set up; always when
     * missing.
     */
    titles?: (settings: S) => boolean;
    /**
     * The settings holding how its references are written, by template, each
     * with the module's own default as its fallback.
     */
    templates?: Partial<Record<keyof Templates, keyof S & string>>;
    /**
     * Whether a reference with this status is finished with, and how: done,
     * like a merged pull request, or dropped, like one closed without
     * merging. Either steps back, so what is still open stands out.
     */
    settled?: (status: string) => Settled | undefined;
};
