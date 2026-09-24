import React, {useState} from 'react';
import {Text, useApp, useInput} from 'ink';
import {DUE_HINTS, Planning} from '#/components/Footer';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Results from '#/components/Results';
import {bodyRows, contentWidth} from '#/components/layout';
import {useOpenTodos, useSize} from '#/hooks';
import type {ViewProps} from '#/components/App';
import {dueOf} from '#/services/due';
import {planning, repeats} from '#/services/input';

const HINTS: [string, string][] = [
    ['x', 'tick'],
    ['+ -', 'priority'],
    ['>', 'due'],
    ['enter', 'open'],
    ['u', 'undo'],
    ['esc', 'back'],
    ['?', 'keys'],
];

/**
 * Every todo still open, whichever day it was written on: what is due first,
 * then by priority, oldest first within one - so the one forgotten longest is
 * the first thing you see.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Open = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {columns, rows} = useSize();
    const {state, dispatch, revision, open, tick, prioritize, plan, schedule, undo} = journal;
    const {mode} = state;
    const todos = useOpenTodos(state.today, revision);
    const late = todos.filter((todo) => dueOf(todo, state.today)?.urgency === 'late').length;
    const today = todos.filter((todo) => dueOf(todo, state.today)?.urgency === 'today').length;
    const [selected, setSelected] = useState(0);
    const visible = bodyRows(rows, 1);

    // ticking removes the row, so the selection stays on whatever moved up
    const current = Math.min(selected, Math.max(0, todos.length - 1));

    useInput((input, key) => {
        if (state.notice) {
            dispatch({type: 'notice'});
        }

        if (mode.kind === 'due') {
            const action = planning(input, key);

            if (action === 'save') {
                schedule();
            } else if (action === 'cancel') {
                dispatch({type: 'close'});
            } else if (action) {
                dispatch(action);
            }

            return;
        }

        if (key.escape || input === 'o') {
            dispatch({type: 'view', view: 'journal'});

            return;
        }

        if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();

            return;
        }

        if (input === '?') {
            dispatch({type: 'view', view: 'keys'});

            return;
        }

        if (key.return) {
            const todo = todos[current];

            if (todo) {
                open(todo.day, todo.id);
            }

            return;
        }

        if (input === 'x' || input === ' ') {
            const todo = todos[current];

            if (todo) {
                tick(todo, todo.day);
            }

            return;
        }

        if (input === 'u') {
            undo();

            return;
        }

        if (input === '+' || input === '=' || input === '-') {
            const todo = todos[current];

            if (todo) {
                prioritize(todo, input === '-' ? -1 : 1, todo.day);
            }

            return;
        }

        if (input === '>') {
            const todo = todos[current];

            if (todo) {
                plan(todo, todo.day);
            }

            return;
        }

        const delta =
            (key.downArrow ? 1 : 0) -
            (key.upArrow ? 1 : 0) +
            repeats(input, 'j') -
            repeats(input, 'k');

        if (delta !== 0) {
            setSelected(Math.max(0, Math.min(todos.length - 1, current + delta)));
        }
    });

    return (
        <Frame
            title={<Text bold>Open todos</Text>}
            subtitle={
                <Text>
                    <Text
                        color={todos.length > 0 ? 'yellow' : undefined}
                        dimColor={todos.length === 0}
                    >
                        {todos.length} open
                    </Text>
                    {late > 0 && (
                        <Text>
                            <Text dimColor> · </Text>
                            <Text color="red">{late} overdue</Text>
                        </Text>
                    )}
                    {today > 0 && (
                        <Text>
                            <Text dimColor> · </Text>
                            <Text color="yellow">{today} due today</Text>
                        </Text>
                    )}
                </Text>
            }
            status={
                mode.kind === 'due' ? (
                    <Planning mode={mode} today={state.today} width={contentWidth(columns)} />
                ) : (
                    state.notice && <Text wrap="truncate-end">{state.notice}</Text>
                )
            }
            footer={
                mode.kind === 'due' ? (
                    <Hints hints={DUE_HINTS} />
                ) : (
                    <Hints hints={HINTS} hidden={!preferences.settings.hints} />
                )
            }
        >
            {todos.length === 0 ? (
                <Text dimColor>Nothing open. Todos you write on any day gather here.</Text>
            ) : (
                <Results
                    results={todos}
                    selected={current}
                    visible={visible}
                    today={state.today}
                    clock={preferences.settings.clock}
                    group="priority"
                />
            )}
        </Frame>
    );
};

export default Open;
