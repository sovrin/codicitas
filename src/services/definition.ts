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
};

/**
 * Checks each definition against the type of its own setting, then lets them
 * be listed together.
 */
export const definer =
    <S>() =>
    <K extends keyof S>(definition: Definition<S, K>): Definition<S> =>
        definition as unknown as Definition<S>;
