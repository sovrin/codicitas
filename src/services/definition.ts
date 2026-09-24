/**
 * How a setting is listed and what it takes, for settings shaped like S.
 */
export type Definition<S, K extends keyof S = keyof S> = {
    id: K;
    label: string;
    /**
     * What the setting changes, shown while it is selected.
     */
    description: string;
    /**
     * The values it steps through. A setting without them is typed instead,
     * for what cannot be listed - an address, a token.
     */
    values?: S[K][];
    // a method, so definitions of settings of different types list together
    format(value: S[K]): string;
    /**
     * Never shown as it is, not even while it is typed.
     */
    secret?: boolean;
    /**
     * For a setting something cannot do without, like a module's token:
     * whether it still needs a value. Such settings are listed first, apart
     * from the rest, and one still needing a value says so.
     */
    missing?(value: S[K]): boolean;
    /**
     * Only changes what a module shows, not how it is set up: changing it
     * leaves what the module found as it is, rather than starting over.
     */
    display?: boolean;
    /**
     * For a setting that gives names to things, like short names to
     * repositories: it is kept as an object of name to value, and changed a
     * page further in, one entry at a time.
     */
    entries?: Entries;
};

/**
 * How the entries of a setting that gives names to things are typed.
 */
export type Entries = {
    /**
     * What a name and a value are called, like short name and repository.
     */
    name: string;
    value: string;
    /**
     * What to type for a value, and for a name, shown while it is typed.
     */
    help: {name: string; value: string};
    /**
     * A value as typed or pasted, made into what is kept; undefined for one
     * it does not take.
     */
    parse: (value: string) => string | undefined;
    /**
     * Whether a name is one it takes.
     */
    isName: (name: string) => boolean;
    /**
     * The name to offer for a value, like a repository's own name.
     */
    suggest: (value: string) => string;
    /**
     * Names the journal already uses without a value, offered to be given
     * one.
     *
     * @param topics every topic in the journal
     */
    wanted?: (topics: string[]) => string[];
};

/**
 * Whether something stored is entries: an object of names to text.
 *
 * @param value
 */
export const isEntries = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string');

/**
 * Checks each definition against the type of its own setting, then lets them
 * be listed together.
 */
export const definer =
    <S>() =>
    <K extends keyof S>(definition: Definition<S, K>): Definition<S> =>
        definition as unknown as Definition<S>;
