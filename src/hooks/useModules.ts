import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {MODULES} from '#/modules';
import {type Answer, type Check, type Module, Refused, type Source} from '#/modules/module';
import {topicsIn} from '#/services/references';
import type {Settings} from '#/services/settings';
import * as store from '#/services/store';
import type {Templates} from '#/services/template';
import {due, type Known} from '#/services/titles';

/**
 * How asking a module last went: not set up, nothing answered yet, checking
 * the sign in, answered, turned the token down, or out of reach.
 */
export type Connection = 'off' | 'waiting' | 'checking' | 'ok' | 'refused' | 'unreachable';

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
    /**
     * What it knows, by reference as written.
     */
    known: ReadonlyMap<string, Known>;
    /**
     * References it was asked about and did not know, as written.
     */
    missing: string[];
    connection: Connection;
    /**
     * What the last check of the sign in found, until the setup changes.
     */
    signin?: Check;
    /**
     * Asks about these references now, however recently it was asked;
     * undefined while the module is not ready.
     */
    refresh: (references: string[]) => Promise<Outcome | undefined>;
    /**
     * Checks the sign in now, whether or not anything was written that the
     * module could be asked about.
     */
    check: () => Promise<void>;
};

export type Modules = {
    modules: Running[];
    /**
     * What every module knows together, the first module's winning.
     */
    known: ReadonlyMap<string, Known>;
    /**
     * Says these references are on screen, until the returned function says
     * they are gone again. Only what is on screen is asked about.
     */
    show: (references: string[]) => () => void;
};

/**
 * Provided once by the app, so every view that shows an entry can show what
 * is known about its references without being handed it.
 */
export const ModulesContext = createContext<Modules>({
    modules: [],
    known: new Map(),
    show: () => () => undefined,
});

export const useKnown = (): ReadonlyMap<string, Known> => useContext(ModulesContext).known;

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
    save: (key: string, answer: Answer | null) => void,
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
                const answer = await source.lookup(key, signal);

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
 * Every answer kept under a scope, null for a reference that was not known.
 *
 * @param scope
 */
const answers = (scope: string): Map<string, Answer | null> =>
    new Map([...store.asked(scope)].map(([key, {answer}]) => [key, answer]));

/**
 * How a module writes its references, as set: each of its templates' settings,
 * or the module's own default where one is left empty. Undefined for a module
 * without templates, which is written the general way.
 *
 * @param module
 * @param settings
 */
const templatesOf = (module: Module, settings: Settings): Partial<Templates> | undefined => {
    const entries = Object.entries(module.templates ?? {}).flatMap(([name, id]) => {
        const typed = settings[id as keyof Settings];
        const fallback = module.settings.find((definition) => definition.id === id)?.fallback;
        const template = typeof typed === 'string' && typed.trim() ? typed.trim() : fallback;

        return template ? [[name, template] as const] : [];
    });

    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

/**
 * What a setup keeps and asks about some references under, each once;
 * references it has nothing to ask about are left out.
 *
 * @param source
 * @param references
 */
const keysOf = (source: Source, references: string[]): string[] => [
    ...new Set(
        references
            .map((reference) => (source.resolve ? source.resolve(reference) : reference))
            .filter((key) => key !== undefined),
    ),
];

/**
 * One module's titles, from the cache at once and from the module in the
 * background: whatever is on screen and was never asked about, or no longer
 * fresh, is asked about now and shown as it comes in. A module that polls is
 * looked at again every so often while codi is open, for answers that went
 * stale meanwhile. What is not on screen is not asked about until it is,
 * unless an open todo mentions it.
 *
 * @param module
 * @param settings
 * @param revision asked again whenever this changes, for references just written
 * @param wanted the references to ask about, as written: those on screen,
 * and those of the todos still open
 * @param checking whether to check the sign in, once and again whenever the
 * setup changes
 */
const useModule = (
    module: Module,
    settings: Settings,
    revision: number,
    wanted: ReadonlySet<string>,
    checking: boolean,
): Running => {
    const enabled = settings[module.id as keyof Settings] === true;
    // what the module is set up from, so it is only set up again when that
    // changes rather than with every other setting
    const setup = JSON.stringify([
        enabled,
        ...module.settings
            .filter(({display}) => !display)
            .map(({id}) => settings[id as keyof Settings]),
    ]);
    const source = useMemo(
        () => (enabled ? module.connect(settings) : undefined),
        // settings are read, but only the module's own say to set it up again
        // oxlint-disable-next-line react/exhaustive-deps
        [module, setup],
    );
    // every reference of the module's in the journal, as written
    const references = useMemo(
        () => store.topics().filter(module.matches),
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [module, revision],
    );
    // every answer, a null one for what the module did not know
    const [stored, setStored] = useState<ReadonlyMap<string, Answer | null>>(() =>
        source ? answers(source.scope) : new Map(),
    );
    const [connection, setConnection] = useState<Connection>(source ? 'waiting' : 'off');
    const [signin, setSignin] = useState<Check>();
    const [tick, setTick] = useState(0);
    const signal = useRef<AbortSignal>(undefined);
    const pending = useRef(new Set<string>());
    const paused = useRef(0);
    const [previous, setPrevious] = useState(source);

    // set up anew, it starts over, reset while rendering so the old titles
    // never show against the new setup
    if (previous !== source) {
        setPrevious(source);
        setStored(source ? answers(source.scope) : new Map());
        setConnection(source ? 'waiting' : 'off');
        setSignin(undefined);
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

    const every = module.poll?.(settings);

    useEffect(() => {
        if (!source || !every) {
            return undefined;
        }

        const timer = setInterval(() => setTick((count) => count + 1), every);

        return () => clearInterval(timer);
    }, [source, every]);

    const run = useCallback(
        async (keys: string[]): Promise<Outcome | undefined> => {
            const current = signal.current;

            if (!source || !current || current.aborted) {
                return undefined;
            }

            const outcome = await ask(source, keys, current, (key, answer) => {
                store.saveTitle(source.scope, key, answer?.title ?? null, answer?.status);
                setStored(answers(source.scope));
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

        const keys = due(
            keysOf(
                source,
                references.filter((reference) => wanted.has(reference)),
            ),
            store.asked(source.scope),
            module.fresh,
        ).filter((key) => !pending.current.has(key));
        const asking = pending.current;

        keys.forEach((key) => asking.add(key));
        void run(keys).finally(() => keys.forEach((key) => asking.delete(key)));
        // the tick is not read, it only says to look again
        // oxlint-disable-next-line react/exhaustive-effect-dependencies
    }, [module, source, references, wanted, tick, run]);

    // asked for, so tried even while the background waits out a failure
    const refresh = useCallback(
        async (asked: string[]) => {
            if (!source) {
                return undefined;
            }

            const keys = keysOf(source, asked);
            const outcome = await run(keys);

            if (outcome?.result === 'done') {
                paused.current = 0;
            }

            // what it has nothing to ask about, it does not know either
            return outcome && {...outcome, missing: outcome.missing + asked.length - keys.length};
        },
        [source, run],
    );

    const check = useCallback(async () => {
        const current = signal.current;

        if (!source || !current || current.aborted) {
            return;
        }

        setConnection('checking');

        try {
            const found = await source.check(current);

            if (current.aborted) {
                return;
            }

            // signed in, so whatever was waited out can be asked again
            paused.current = 0;
            setSignin(found);
            setConnection('ok');
        } catch (reason) {
            if (current.aborted) {
                return;
            }

            const refused = reason instanceof Refused;

            paused.current = refused ? Infinity : Date.now() + PAUSE;
            setSignin(undefined);
            setConnection(refused ? 'refused' : 'unreachable');
        }
    }, [source]);

    useEffect(() => {
        if (checking) {
            void check();
        }
    }, [checking, check]);

    const titled = module.titles?.(settings) ?? true;
    const templates = useMemo(() => templatesOf(module, settings), [module, settings]);
    const {known, missing} = useMemo(() => {
        const found = new Map<string, Known>();
        const unknown: string[] = [];

        for (const reference of source ? references : []) {
            const key = source.resolve ? source.resolve(reference) : reference;
            const answer = key === undefined ? undefined : stored.get(key);
            const badge = answer?.status ? module.badge?.(answer.status, settings) : undefined;
            const settled = answer?.status ? module.settled?.(answer.status) : undefined;

            if (answer === null) {
                unknown.push(reference);
            } else if (answer) {
                found.set(reference, {
                    link: source.link(key),
                    ...(titled ? {title: answer.title} : {}),
                    ...(settled ? {settled} : {}),
                    // a mark for who cannot tell the colours apart, a
                    // coloured underline for everyone else
                    ...(badge ? {badge, marked: settings.colourBlind} : {}),
                    ...(badge?.color && !settings.colourBlind ? {underline: badge.color} : {}),
                    ...(templates ? {templates} : {}),
                });
            }
        }

        return {known: found, missing: unknown};
    }, [module, settings, titled, templates, source, references, stored]);

    return useMemo(
        () => ({
            module,
            enabled,
            ready: !!source,
            known,
            missing,
            connection,
            signin,
            refresh,
            check,
        }),
        [module, enabled, source, known, missing, connection, signin, refresh, check],
    );
};

/**
 * Every module, run while it is turned on, and what they know together.
 *
 * @param settings
 * @param revision
 * @param checking whether the sign ins are checked, as while the modules are
 * on screen: once, and again whenever a module's setup changes
 */
const useModules = (settings: Settings, revision: number, checking = false): Modules => {
    // how many places on screen show each reference
    const shown = useRef(new Map<string, number>());
    const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());

    // a new set only when what is on screen changed, not with every redraw
    const update = useCallback(() => {
        setVisible((current) => {
            const next = shown.current;

            return next.size === current.size && [...next.keys()].every((name) => current.has(name))
                ? current
                : new Set(next.keys());
        });
    }, []);

    const show = useCallback(
        (references: string[]) => {
            for (const reference of references) {
                shown.current.set(reference, (shown.current.get(reference) ?? 0) + 1);
            }

            update();

            return () => {
                for (const reference of references) {
                    const count = (shown.current.get(reference) ?? 1) - 1;

                    if (count > 0) {
                        shown.current.set(reference, count);
                    } else {
                        shown.current.delete(reference);
                    }
                }

                update();
            };
        },
        [update],
    );

    // an open todo is carried from day to day and turns up in the standup,
    // so what it mentions is kept fresh wherever it is
    const carried = useMemo(
        () => topicsIn(...store.openTodos().map(({text}) => text)),
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [revision],
    );
    const wanted = useMemo(() => new Set([...visible, ...carried]), [visible, carried]);

    // the modules are fixed when codi is built, so every render calls the
    // same hooks in the same order
    const modules = MODULES.map((module) =>
        // oxlint-disable-next-line react/rules-of-hooks
        useModule(module, settings, revision, wanted, checking),
    );

    return {
        modules,
        known:
            modules.length === 1
                ? modules[0].known
                : new Map(modules.toReversed().flatMap(({known}) => [...known])),
        show,
    };
};

export default useModules;
