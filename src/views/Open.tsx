import React, {useState} from 'react';
import {Text, useApp, useInput} from 'ink';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Results from '#/components/Results';
import {bodyRows} from '#/components/layout';
import {useOpenTodos, useSize} from '#/hooks';
import type {ViewProps} from '#/components/App';
import {repeats} from '#/services/input';

const HINTS: [string, string][] = [
    ['x', 'tick'],
    ['+ -', 'priority'],
    ['enter', 'open'],
    ['u', 'undo'],
    ['esc', 'back'],
    ['?', 'keys'],
];

/**
 * Every todo still open, whichever day it was written on, oldest first - so
 * the one forgotten longest is the first thing you see.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Open = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {rows} = useSize();
    const {state, dispatch, revision, open, tick, prioritize, undo} = journal;
    const todos = useOpenTodos(revision);
    const [selected, setSelected] = useState(0);
    const visible = bodyRows(rows, 1);

    // ticking removes the row, so the selection stays on whatever moved up
    const current = Math.min(selected, Math.max(0, todos.length - 1));

    useInput((input, key) => {
        if (state.notice) {
            dispatch({type: 'notice'});
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
                <Text color={todos.length > 0 ? 'yellow' : undefined} dimColor={todos.length === 0}>
                    {todos.length} open
                </Text>
            }
            status={state.notice && <Text wrap="truncate-end">{state.notice}</Text>}
            footer={<Hints hints={HINTS} hidden={!preferences.settings.hints} />}
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
