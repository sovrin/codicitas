import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {type Jira, jiraOf, Refused, title} from '#/services/jira';
import type {Settings} from '#/services/settings';
import * as store from '#/services/store';
import {due} from '#/services/tickets';

/**
 * How asking Jira last went: not set up, nothing answered yet, answered,
 * turned the token down, or out of reach.
 */
export type Connection = 'off' | 'waiting' | 'ok' | 'refused' | 'unreachable';

/**
 * How a round of questions ended, and how many tickets Jira knew.
 */
export type Outcome = {
    result: 'done' | 'refused' | 'unreachable' | 'dropped';
    found: number;
    missing: number;
};

export type Tickets = {
    /**
     * The Jira titles come from, for linking to its tickets.
     */
    site?: string;
    titles: ReadonlyMap<string, string>;
    connection: Connection;
    /**
     * Asks Jira about these tickets now, however recently it was asked;
     * undefined while Jira is not set up.
     */
    refresh: (keys: string[]) => Promise<Outcome | undefined>;
};

/**
 * Provided once by the app, so every view that shows an entry can show the
 * titles of its tickets without being handed them.
 */
export const TicketsContext = createContext<Tickets>({
    titles: new Map(),
    connection: 'off',
    refresh: async () => undefined,
});

export const useTitles = (): ReadonlyMap<string, string> => useContext(TicketsContext).titles;

/**
 * Enough at once to fill a first start quickly, few enough not to be a burden
 * on Jira.
 */
const PARALLEL = 4;

/**
 * After Jira could not be reached, how long before trying again, so writing
 * on a train does not send a round of requests with every entry.
 */
const PAUSE = 5 * 60_000;

/**
 * Asks Jira about each ticket, a few at a time, handing every answer to
 * `save` as it comes. The first failure ends the round: whatever went wrong
 * for one ticket will go wrong for the next.
 *
 * @param jira
 * @param keys
 * @param signal
 * @param save
 */
const ask = async (
    jira: Jira,
    keys: string[],
    signal: AbortSignal,
    save: (key: string, title: string | null) => void,
): Promise<Outcome> => {
    const queue = [...keys];
    let failure: 'refused' | 'unreachable' | undefined;
    let found = 0;
    let missing = 0;

    const work = async () => {
        while (queue.length > 0 && !signal.aborted && !failure) {
            const key = queue.shift();

            try {
                // each worker asks one at a time, the pool is what runs them side by side
                // oxlint-disable-next-line no-await-in-loop
                const answer = await title(jira, key, signal);

                if (signal.aborted) {
                    return;
                }

                save(key, answer);

                if (answer) {
                    found++;
                } else {
                    missing++;
                }
            } catch (reason) {
                if (!signal.aborted) {
                    failure ??= reason instanceof Refused ? 'refused' : 'unreachable';
                }
            }
        }
    };

    await Promise.all(Array.from({length: Math.min(PARALLEL, queue.length)}, work));

    return {result: signal.aborted ? 'dropped' : (failure ?? 'done'), found, missing};
};

/**
 * The titles of the tickets in the journal, from the cache at once and from
 * Jira in the background: whatever was never asked about, or not for a week,
 * is asked about now and shown as it comes in.
 *
 * @param settings
 * @param revision asked again whenever this changes, for tickets just written
 */
const useTickets = ({jiraSite, jiraEmail, jiraToken}: Settings, revision: number): Tickets => {
    const jira = useMemo(
        () => jiraOf({site: jiraSite, email: jiraEmail, token: jiraToken}),
        [jiraSite, jiraEmail, jiraToken],
    );
    const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() =>
        jira ? store.titles(jira.site) : new Map(),
    );
    const [connection, setConnection] = useState<Connection>(jira ? 'waiting' : 'off');
    const signal = useRef<AbortSignal>(undefined);
    const pending = useRef(new Set<string>());
    const paused = useRef(0);
    const [previous, setPrevious] = useState(jira);

    // a new site or sign in starts over, reset while rendering so the old
    // titles never show against the new site
    if (previous !== jira) {
        setPrevious(jira);
        setTitles(jira ? store.titles(jira.site) : new Map());
        setConnection(jira ? 'waiting' : 'off');
    }

    // whatever was still being asked with the old one is dropped
    useEffect(() => {
        const controller = new AbortController();

        signal.current = controller.signal;
        pending.current = new Set();
        paused.current = 0;

        return () => controller.abort();
        // jira is not read, a new one only says to start over
        // oxlint-disable-next-line react/exhaustive-effect-dependencies
    }, [jira]);

    const run = useCallback(
        async (keys: string[]): Promise<Outcome | undefined> => {
            const current = signal.current;

            if (!jira || !current || current.aborted) {
                return undefined;
            }

            const outcome = await ask(jira, keys, current, (key, answer) => {
                store.saveTitle(jira.site, key, answer);
                setTitles(store.titles(jira.site));
                setConnection('ok');
            });

            if (outcome.result === 'refused' || outcome.result === 'unreachable') {
                // the same token will be turned down again, so not until it
                // changes or is asked for
                paused.current = outcome.result === 'refused' ? Infinity : Date.now() + PAUSE;
                setConnection(outcome.result);
            }

            return outcome;
        },
        [jira],
    );

    useEffect(() => {
        if (!jira || Date.now() < paused.current) {
            return;
        }

        const keys = due(store.tickets(), store.asked(jira.site)).filter(
            (key) => !pending.current.has(key),
        );
        const asking = pending.current;

        keys.forEach((key) => asking.add(key));
        void run(keys).finally(() => keys.forEach((key) => asking.delete(key)));
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react/exhaustive-effect-dependencies
    }, [jira, revision, run]);

    // asked for, so tried even while the background waits out a failure
    const refresh = useCallback(
        async (keys: string[]) => {
            const outcome = await run(keys);

            if (outcome?.result === 'done') {
                paused.current = 0;
            }

            return outcome;
        },
        [run],
    );

    const site = jira?.site;

    return useMemo(
        () => ({site, titles, connection, refresh}),
        [site, titles, connection, refresh],
    );
};

export default useTickets;
