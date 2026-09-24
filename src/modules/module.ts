import type {Definition} from '#/services/definition';

/**
 * The service answered, but would not say: the token is wrong, expired or
 * lacks access. Asking again with the same token will not help.
 */
export class Refused extends Error {}

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
     * A reference's title, or null when there is no such thing. Throws
     * Refused when the sign in is turned down, anything else when the service
     * could not be asked.
     */
    title: (reference: string, signal?: AbortSignal) => Promise<string | null>;
    /**
     * Where the reference can be opened.
     */
    link: (reference: string) => string;
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
};
