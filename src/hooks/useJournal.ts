import {useCallback, useEffect, useReducer, useRef, useState} from 'react';
import type {Draft} from '#/services/editor';
import {
    type Entry,
    initial,
    type Intent,
    listDays,
    prepare,
    PRIORITIES,
    rank,
    reducer,
    stepDay,
    toggle as flip,
} from '#/services/journal';
import * as store from '#/services/store';
import {quote, toClock, toHeadline, toKey} from '#/utils';

/**
 * What a write did, recorded so it can be taken back.
 */
type Change =
    | {kind: 'add'; day: string; id: number}
    | {kind: 'edit'; day: string; before: Entry}
    | {kind: 'remove'; row: store.Stored}
    | {kind: 'move'; id: number; from: string; to: string; text: string};

/**
 * Enough to take back a morning's slips without holding on to the whole
 * session.
 */
const HISTORY = 100;

/**
 * An entry as a notice quotes it: short enough that what the notice says
 * after it - where it went - is not cut off.
 *
 * @param text
 */
const firstLine = (text: string): string => quote(text, 40);

/**
 * Reads a day from the database, shaped as the intent that shows it.
 *
 * @param day
 * @param today
 * @param id the entry to select, the newest when not given
 */
const read = (day: string, today: string, id?: number): Intent => {
    const entries = store.load(day);
    const index = entries.findIndex((entry) => entry.id === id);

    return {
        type: 'open',
        day,
        entries,
        days: listDays(store.days(), today),
        index: index === -1 ? undefined : index,
    };
};

/**
 * The journal's state plus everything that touches the database. The reducer
 * stays pure; each write is followed by reading back what it touched, so the
 * screen shows what was stored rather than what was meant to be.
 *
 * @param today follows the clock, so a journal left open overnight moves on
 */
const useJournal = (today: string = toKey()) => {
    // loaded in the initializer, so the first frame already shows today
    const [state, dispatch] = useReducer(reducer, today, (key) =>
        reducer(initial(key), read(key, key)),
    );
    const {day, entries, index, mode} = state;
    const history = useRef<Change[]>([]);

    /**
     * Bumped on every write, so views reading the database for themselves -
     * the standup, the search, the open todos - know to read again.
     */
    const [revision, setRevision] = useState(0);

    const open = useCallback(
        (key: string, id?: number) => {
            dispatch(read(key, today, id));
        },
        [today],
    );

    // past midnight: whoever was looking at today goes on to the new one, unless
    // they are halfway through writing; anyone looking elsewhere stays there
    useEffect(() => {
        if (state.today === today) {
            return;
        }

        const wasToday =
            state.day === state.today && state.mode.kind === 'normal' && state.view === 'journal';

        dispatch({type: 'today', today, days: listDays(store.days(), today)});

        if (wasToday) {
            open(today);
        }
    }, [today, state.today, state.day, state.mode.kind, state.view, open]);

    const go = useCallback(
        (delta: number) => {
            open(stepDay(state.days, day, delta));
        },
        [open, state.days, day],
    );

    /**
     * Brings the day on screen up to date after a write.
     */
    const reload = useCallback(
        (select?: number) => {
            const loaded = store.load(day);
            const at = loaded.findIndex(({id}) => id === select);

            setRevision((current) => current + 1);
            dispatch({
                type: 'entries',
                entries: loaded,
                days: listDays(store.days(), today),
                index: at === -1 ? undefined : at,
            });
        },
        [day, today],
    );

    const record = useCallback(
        (change: Change, select?: number) => {
            history.current = [...history.current, change].slice(-HISTORY);
            reload(select);
        },
        [reload],
    );

    /**
     * Saves the prompt. A draft can be handed in when it was changed in the
     * same keypress, before the state holding it caught up.
     */
    const submit = useCallback(
        (draft?: Draft) => {
            if (mode.kind !== 'compose') {
                return;
            }

            const prepared = prepare((draft ?? mode.draft).buffer, mode.tag, today);

            if (!prepared) {
                dispatch({type: 'close'});

                return;
            }

            const entry = entries[mode.index];

            if (entry) {
                store.update(entry.id, prepared);
                record({kind: 'edit', day, before: entry}, entry.id);

                return;
            }

            const id = store.add(day, {...prepared, time: prepared.time ?? toClock()});

            record({kind: 'add', day, id}, id);
        },
        [mode, entries, day, today, record],
    );

    /**
     * Ticks a todo off, or back on - on screen or on another day.
     */
    const tick = useCallback(
        (entry: Entry, on: string = day) => {
            if (flip(entry) === entry) {
                return;
            }

            store.update(entry.id, flip(entry));
            record({kind: 'edit', day: on, before: entry}, entry.id);
        },
        [day, record],
    );

    /**
     * Raises or lowers a todo's priority, on screen or on another day.
     */
    const prioritize = useCallback(
        (entry: Entry, delta: number, on: string = day) => {
            if (entry.tag !== 'todo') {
                dispatch({type: 'notice', text: 'Only todos have a priority'});

                return;
            }

            const priority = rank(entry, delta);

            if (priority === (entry.priority ?? rank(entry, 0))) {
                dispatch({type: 'notice', text: `Already ${PRIORITIES[priority - 1].name}`});

                return;
            }

            store.update(entry.id, {tag: entry.tag, text: entry.text, priority});
            record({kind: 'edit', day: on, before: entry}, entry.id);
            dispatch({
                type: 'notice',
                text: `"${firstLine(entry.text)}" is ${PRIORITIES[priority - 1].name} now`,
            });
        },
        [day, record],
    );

    /**
     * Starts choosing a todo's due date, on screen or on another day.
     */
    const plan = useCallback(
        (entry: Entry, on: string = day) => {
            if (entry.tag !== 'todo') {
                dispatch({type: 'notice', text: 'Only todos have a due date'});

                return;
            }

            dispatch({type: 'due.open', entry, day: on});
        },
        [day],
    );

    /**
     * Gives the todo being planned the day chosen for it, or takes its date
     * away.
     */
    const schedule = useCallback(() => {
        if (mode.kind !== 'due') {
            return;
        }

        const {entry, day: on, target} = mode;

        if (target === entry.due) {
            dispatch({type: 'close'});

            return;
        }

        store.update(entry.id, {tag: entry.tag, text: entry.text, due: target ?? null});
        record({kind: 'edit', day: on, before: entry}, entry.id);
        dispatch({
            type: 'notice',
            text: target
                ? `"${firstLine(entry.text)}" is due ${toHeadline(target, today)}`
                : `"${firstLine(entry.text)}" has no due date now`,
        });
    }, [mode, today, record]);

    const toggle = useCallback(() => {
        if (entries[index]) {
            tick(entries[index]);
        }
    }, [entries, index, tick]);

    const remove = useCallback(() => {
        const entry = mode.kind === 'confirm' ? entries[mode.index] : undefined;
        const row = entry && store.get(entry.id);

        if (!row) {
            return;
        }

        store.remove(row.id);
        record({kind: 'remove', row});
    }, [mode, entries, record]);

    /**
     * Moves the entry being moved to the day chosen for it. The day on screen
     * stays, so what else was on it is still in front of you.
     */
    const move = useCallback(() => {
        const entry = mode.kind === 'move' ? entries[mode.index] : undefined;

        if (!entry || mode.kind !== 'move') {
            return;
        }

        if (mode.target === day) {
            dispatch({type: 'close'});

            return;
        }

        store.move(entry.id, mode.target);
        record({kind: 'move', id: entry.id, from: day, to: mode.target, text: entry.text});
        dispatch({
            type: 'notice',
            text: `Moved "${firstLine(entry.text)}" to ${toHeadline(mode.target, today)}`,
        });
    }, [mode, entries, day, today, record]);

    /**
     * Takes back the last write. In the journal the day it happened on is
     * opened, so what came back - or went away - is in front of you.
     */
    const undo = useCallback(() => {
        const change = history.current.at(-1);

        if (!change) {
            dispatch({type: 'notice', text: 'Nothing to undo'});

            return;
        }

        history.current = history.current.slice(0, -1);

        const [on, id, notice] = ((): [string, number | undefined, string] => {
            switch (change.kind) {
                case 'add': {
                    const text = store.get(change.id)?.text ?? '';

                    store.remove(change.id);

                    return [change.day, undefined, `Took back "${firstLine(text)}"`];
                }

                case 'edit':
                    store.update(change.before.id, {
                        ...change.before,
                        priority: change.before.priority ?? null,
                        due: change.before.due ?? null,
                    });

                    return [
                        change.day,
                        change.before.id,
                        `Restored "${firstLine(change.before.text)}"`,
                    ];

                case 'remove':
                    store.restore(change.row);

                    return [
                        change.row.day,
                        change.row.id,
                        `Brought back "${firstLine(change.row.text)}"`,
                    ];

                case 'move':
                    store.move(change.id, change.from);

                    return [change.from, change.id, `Moved "${firstLine(change.text)}" back`];
            }
        })();

        if (state.view === 'journal') {
            setRevision((current) => current + 1);
            open(on, id);
        } else {
            reload();
        }

        dispatch({type: 'notice', text: notice});
    }, [state.view, open, reload]);

    return {
        state,
        dispatch,
        revision,
        open,
        go,
        submit,
        tick,
        toggle,
        prioritize,
        plan,
        schedule,
        remove,
        move,
        undo,
    };
};

export type Journal = ReturnType<typeof useJournal>;

export default useJournal;
