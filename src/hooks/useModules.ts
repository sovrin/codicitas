import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {MODULES} from '#/modules';
import {type Module, Refused, type Source} from '#/modules/module';
import type {Settings} from '#/services/settings';
import * as store from '#/services/store';
import {due} from '#/services/titles';

/**
 * How asking a module last went: not set up, nothing answered yet, answered,
 * turned the token down, or out of reach.
 */
export type Connection = 'off' | 'waiting' | 'ok' | 'refused' | 'unreachable';

/**
 * How a round of questions ended, and how many references the module knew.
 */
export type Outcome = {
    result: 'done' | 'refused' | 'unreachable' | 'dropped';
    found: number;
    missing: number;
};

/**
 * A module as the app runs it.
 */
export type Running = {
    module: Module;
    /**
     * Turned on in the settings.
     */
    enabled: boolean;
    /**
     * Turned on and set up, so there is someone to ask.
     */
    ready: boolean;
    titles: ReadonlyMap<string, string>;
    /**
     * Where each reference with a title can be opened.
     */
    links: ReadonlyMap<string, string>;
    connection: Connection;
    /**
     * Asks about these references now, however recently it was asked;
     * undefined while the module is not ready.
     */
    refresh: (keys: string[]) => Promise<Outcome | undefined>;
};

export type Modules = {
    modules: Running[];
    /**
     * Every module's titles together, the first module's winning.
     */
    titles: ReadonlyMap<string, string>;
    links: ReadonlyMap<string, string>;
};

/**
 * Provided once by the app, so every view that shows an entry can show the
 * titles of its references without being handed them.
 */
export const ModulesContext = createContext<Modules>({
    modules: [],
    titles: new Map(),
    links: new Map(),
});

export const useTitles = (): ReadonlyMap<string, string> => useContext(ModulesContext).titles;

/**
 * Enough at once to fill a first start quickly, few enough not to be a burden
 * on the service asked.
 */
const PARALLEL = 4;

/**
 * After a service could not be reached, how long before trying again, so
 * writing on a train does not send a round of requests with every entry.
 */
const PAUSE = 5 * 60_000;

/**
 * Asks about each reference, a few at a time, handing every answer to `save`
 * as it comes. The first failure ends the round: whatever went wrong for one
 * reference will go wrong for the next.
 *
 * @param source
 * @param keys
 * @param signal
 * @param save
 */
const ask = async (
    source: Source,
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
                const answer = await source.title(key, signal);

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
 * One module's titles, from the cache at once and from the module in the
 * background: whatever was never asked about, or not for a week, is asked
 * about now and shown as it comes in.
 *
 * @param module
 * @param settings
 * @param revision asked again whenever this changes, for references just written
 */
const useModule = (module: Module, settings: Settings, revision: number): Running => {
    const enabled = settings[module.id as keyof Settings] === true;
    // what the module is set up from, so it is only set up again when that
    // changes rather than with every other setting
    const setup = JSON.stringify([
        enabled,
        ...module.settings.map(({id}) => settings[id as keyof Settings]),
    ]);
    const source = useMemo(
        () => (enabled ? module.connect(settings) : undefined),
        // settings are read, but only the module's own say to set it up again
        // oxlint-disable-next-line react/exhaustive-deps
        [module, setup],
    );
    const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() =>
        source ? store.titles(source.scope) : new Map(),
    );
    const [connection, setConnection] = useState<Connection>(source ? 'waiting' : 'off');
    const signal = useRef<AbortSignal>(undefined);
    const pending = useRef(new Set<string>());
    const paused = useRef(0);
    const [previous, setPrevious] = useState(source);

    // set up anew, it starts over, reset while rendering so the old titles
    // never show against the new setup
    if (previous !== source) {
        setPrevious(source);
        setTitles(source ? store.titles(source.scope) : new Map());
        setConnection(source ? 'waiting' : 'off');
    }

    // whatever was still being asked with the old setup is dropped
    useEffect(() => {
        const controller = new AbortController();

        signal.current = controller.signal;
        pending.current = new Set();
        paused.current = 0;

        return () => controller.abort();
        // source is not read, a new one only says to start over
        // oxlint-disable-next-line react/exhaustive-effect-dependencies
    }, [source]);

    const run = useCallback(
        async (keys: string[]): Promise<Outcome | undefined> => {
            const current = signal.current;

            if (!source || !current || current.aborted) {
                return undefined;
            }

            const outcome = await ask(source, keys, current, (key, answer) => {
                store.saveTitle(source.scope, key, answer);
                setTitles(store.titles(source.scope));
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
        [source],
    );

    useEffect(() => {
        if (!source || Date.now() < paused.current) {
            return;
        }

        const keys = due(store.topics().filter(module.matches), store.asked(source.scope)).filter(
            (key) => !pending.current.has(key),
        );
        const asking = pending.current;

        keys.forEach((key) => asking.add(key));
        void run(keys).finally(() => keys.forEach((key) => asking.delete(key)));
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react/exhaustive-effect-dependencies
    }, [module, source, revision, run]);

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

    const links = useMemo(
        () =>
            new Map(
                source ? [...titles.keys()].map((key) => [key, source.link(key)] as const) : [],
            ),
        [source, titles],
    );

    return useMemo(
        () => ({module, enabled, ready: !!source, titles, links, connection, refresh}),
        [module, enabled, source, titles, links, connection, refresh],
    );
};

/**
 * Every map together, the first to know a key winning.
 *
 * @param maps
 */
const merge = (maps: ReadonlyMap<string, string>[]): ReadonlyMap<string, string> =>
    maps.length === 1 ? maps[0] : new Map(maps.toReversed().flatMap((map) => [...map]));

/**
 * Every module, run while it is turned on, and what they know together.
 *
 * @param settings
 * @param revision
 */
const useModules = (settings: Settings, revision: number): Modules => {
    // the modules are fixed when codi is built, so every render calls the
    // same hooks in the same order
    // oxlint-disable-next-line react/rules-of-hooks
    const modules = MODULES.map((module) => useModule(module, settings, revision));

    return {
        modules,
        titles: merge(modules.map(({titles}) => titles)),
        links: merge(modules.map(({links}) => links)),
    };
};

export default useModules;
