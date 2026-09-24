import React, {useContext} from 'react';
import {Text, useApp, useInput, usePaste} from 'ink';
import {Legend, Status} from '#/components/Footer';
import Frame from '#/components/Frame';
import Summary from '#/components/Summary';
import Timeline from '#/components/Timeline';
import {WeekMarks, WeekNames} from '#/components/Week';
import {bodyRows, contentWidth, textWidth} from '#/components/layout';
import {ModulesContext, useMentions, useNow, useSize} from '#/hooks';
import type {Outcome} from '#/hooks/useModules';
import {MODULES} from '#/modules';
import type {Module} from '#/modules/module';
import type {ViewProps} from '#/components/App';
import {candidates, complete, ghost, tokenAt} from '#/services/completion';
import {draft, draft as empty, insert} from '#/services/editor';
import {edit, isNewline, line, repeats} from '#/services/input';
import {splitPrefixes} from '#/services/journal';
import {firstPerson, firstReference, topicsIn} from '#/services/references';
import {toClock, toHeadline} from '#/utils';

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * What refreshing the modules' references came to, said in the status row:
 * what was refreshed in one go, 4 references rather than 1 ticket and 3 pull
 * requests, what none of them knew, and what went wrong after it.
 *
 * @param outcomes each module's, undefined for one that was not asked
 */
const refreshed = (outcomes: [Module, Outcome | undefined][]): string => {
    const done = outcomes.flatMap(([module, outcome]) =>
        outcome?.result === 'done' ? [{module, ...outcome}] : [],
    );
    // one module's references still go by its own name for them
    const noun = done.length === 1 ? done[0].module.noun : 'reference';
    const found = done.reduce((sum, outcome) => sum + outcome.found, 0);
    const missing = done
        .filter((outcome) => outcome.missing > 0)
        .map((outcome) => `${outcome.missing} not in ${outcome.module.name}`)
        .join(' and ');
    const failed = outcomes.flatMap(([{name}, outcome]) =>
        outcome?.result === 'refused'
            ? [`${name} turned the token down; check it under modules`]
            : outcome?.result === 'unreachable'
              ? [`${name} could not be reached`]
              : [],
    );

    return [
        ...(done.length > 0
            ? [`Refreshed ${plural(found, noun)}${missing ? `, ${missing}` : ''}`]
            : []),
        ...failed,
    ].join('; ');
};

/**
 * What every module calls its references, for saying there are none.
 */
const NOUNS = MODULES.map(({noun}) => `${noun}s`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' or $1');

/**
 * A day's entries, and writing them. The mode decides what a key means, so
 * nothing has to coordinate with anything else.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Journal = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {columns, rows} = useSize();
    const {state, dispatch, open, go, submit, toggle, prioritize, remove, move, undo} = journal;
    const {mode, entries, index, day, days, today} = state;
    const {settings} = preferences;
    const clock = toClock(useNow());
    const known = useMentions(journal.revision);
    const {modules} = useContext(ModulesContext);

    // the @name or #topic being typed, and what it could become
    const token = mode.kind === 'compose' ? tokenAt(mode.draft) : undefined;
    const suggestions = token ? candidates(token, known[token.kind]) : [];
    const pick =
        mode.kind === 'compose' && suggestions.length > 0
            ? ((mode.pick % suggestions.length) + suggestions.length) % suggestions.length
            : 0;
    const suggestion = suggestions[pick];
    const width = textWidth(columns, settings.clock);
    const visible = bodyRows(rows, 1);

    // a paste is text, never a string of commands: it lands in the prompt, and
    // opens one when there is none, newlines and all
    usePaste((text) => {
        // a paste while confirming or choosing a day is not meant as an entry
        if (mode.kind === 'confirm' || mode.kind === 'move') {
            return;
        }

        const current = mode.kind === 'compose' ? mode.draft : empty();

        if (mode.kind !== 'compose') {
            dispatch({type: 'compose.open', tag: settings.tag});
        }

        dispatch({type: 'compose.draft', draft: insert(current, text, settings.indent)});
    });

    useInput((input, key) => {
        if (state.notice) {
            dispatch({type: 'notice'});
        }

        if (mode.kind === 'compose') {
            if (key.return && !isNewline(input, key)) {
                submit();

                return;
            }

            if (key.escape) {
                dispatch({type: 'close'});

                return;
            }

            if (key.ctrl && input === 't') {
                dispatch({type: 'compose.tag', delta: 1});

                return;
            }

            // tab only completes while a completion is on screen; anywhere
            // else it indents as it always does
            if (suggestion && ((key.tab && !key.shift) || key.rightArrow)) {
                dispatch({type: 'compose.draft', draft: complete(mode.draft, token, suggestion)});

                return;
            }

            if (suggestions.length > 1 && key.ctrl && (input === 'n' || input === 'p')) {
                dispatch({type: 'compose.pick', delta: input === 'n' ? 1 : -1});

                return;
            }

            const next = edit(mode.draft, input, key, width, settings.indent);

            if (next !== undefined) {
                dispatch({type: 'compose.draft', draft: next});
            }

            // without bracketed paste a paste arrives as typing, return and
            // all, and the return still means save
            if (input.length > 1 && line(input).isComplete) {
                submit(next);
            }

            return;
        }

        if (mode.kind === 'move') {
            if (key.return || input === 'y') {
                move();
            } else if (key.escape || input === 'q') {
                dispatch({type: 'close'});
            } else if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
                dispatch({type: 'move.step', delta: key.leftArrow || input === 'h' ? -1 : 1});
            } else if (input === 't') {
                dispatch({type: 'move.today'});
            }

            return;
        }

        if (mode.kind === 'confirm') {
            if (input === 'y') {
                remove();
            } else {
                dispatch({type: 'close'});
            }

            return;
        }

        if (key.ctrl && input === 'd') {
            exit();

            return;
        }

        if (key.ctrl || key.meta) {
            return;
        }

        if (key.upArrow || key.downArrow) {
            dispatch({type: 'move', delta: key.downArrow ? 1 : -1});

            return;
        }

        // the list runs newest first, so left, back in time, is a step down it
        if (key.leftArrow || key.rightArrow) {
            go(key.leftArrow ? 1 : -1);

            return;
        }

        if (key.return) {
            dispatch({type: 'compose.open', tag: settings.tag});

            return;
        }

        const {text} = line(input);

        switch (text[0]) {
            case 'q':
                exit();

                return;

            case 'i':
            case 'a':
                dispatch({type: 'compose.open', tag: settings.tag});

                return;

            case 'e':
                dispatch({type: 'compose.open', index});

                return;

            case 'x':
            case ' ':
                toggle();

                return;

            case 'd':
                dispatch({type: 'confirm.open'});

                return;

            case 'm':
                dispatch({type: 'move.open'});

                return;

            case '+':
            case '=':
            case '-':
                if (entries[index]) {
                    prioritize(entries[index], text[0] === '-' ? -1 : 1);
                }

                return;

            case '#':
            case '@': {
                const find = text[0] === '#' ? firstReference : firstPerson;
                const reference = entries[index] && find(entries[index].text);

                if (!reference) {
                    dispatch({
                        type: 'notice',
                        text:
                            text[0] === '#'
                                ? 'This entry has no #topic or ticket to search for'
                                : 'This entry mentions no @colleague to search for',
                    });

                    return;
                }

                dispatch({type: 'query', draft: draft(reference)});
                dispatch({type: 'view', view: 'search'});

                return;
            }

            case 'j':
            case 'k':
                dispatch({type: 'move', delta: repeats(text, 'j') - repeats(text, 'k')});

                return;

            case 'h':
            case '[':
                go(1);

                return;

            case 'l':
            case ']':
                go(-1);

                return;

            case 'g':
                dispatch({type: 'move', delta: -entries.length});

                return;

            case 'G':
                dispatch({type: 'move', delta: entries.length});

                return;

            case 't':
                open(today);

                return;

            case 'u':
                undo();

                return;

            case 'o':
                dispatch({type: 'view', view: 'open'});

                return;

            case 'r': {
                const topics = topicsIn(...entries.map((entry) => entry.text));
                // the modules with something on the day to ask about
                const wanted = modules
                    .map((running) => ({
                        ...running,
                        keys: topics.filter(running.module.matches),
                    }))
                    .filter(({keys}) => keys.length > 0);
                const asking = wanted.filter(({ready}) => ready);

                if (wanted.length === 0) {
                    dispatch({type: 'notice', text: `No ${NOUNS} on this day`});

                    return;
                }

                if (asking.length === 0) {
                    const [{module, enabled}] = wanted;

                    dispatch({
                        type: 'notice',
                        text: `${enabled ? 'Set up' : 'Turn on'} ${module.name} under modules to show ${module.noun} titles`,
                    });

                    return;
                }

                dispatch({
                    type: 'notice',
                    text: `Asking ${asking
                        .map(
                            ({module, keys}) =>
                                `${module.name} about ${plural(keys.length, module.noun)}`,
                        )
                        .join(' and ')}`,
                });
                void Promise.all(
                    asking.map(({module, keys, refresh}) =>
                        refresh(keys).then((outcome): [Module, Outcome | undefined] => [
                            module,
                            outcome,
                        ]),
                    ),
                ).then((outcomes) => {
                    const notice = refreshed(outcomes);

                    if (notice) {
                        dispatch({type: 'notice', text: notice});
                    }
                });

                return;
            }

            case '?':
                dispatch({type: 'view', view: 'keys'});

                return;

            case ',':
                dispatch({type: 'view', view: 'settings'});

                return;

            case 's':
                dispatch({type: 'view', view: 'standup'});

                return;

            case '/':
                dispatch({type: 'view', view: 'search'});

                return;
        }
    });

    // a /tag or @time typed at the start already shows as what will be saved
    const prefixes = mode.kind === 'compose' ? splitPrefixes(mode.draft.buffer) : undefined;
    const composing =
        mode.kind === 'compose'
            ? {
                  draft: mode.draft,
                  tag: prefixes.tag ?? mode.tag,
                  time: prefixes.time,
                  index: mode.index,
                  ghost: suggestion && ghost(token, suggestion),
              }
            : undefined;

    return (
        <Frame
            title={<Text bold>{toHeadline(day, today)}</Text>}
            subtitle={<Summary entries={entries} />}
            aside={<WeekNames day={day} days={days} start={settings.weekStart} />}
            subaside={<WeekMarks day={day} days={days} start={settings.weekStart} />}
            status={
                <Status
                    mode={mode}
                    entries={entries}
                    notice={state.notice}
                    today={today}
                    suggestions={suggestions}
                    pick={pick}
                    width={contentWidth(columns)}
                />
            }
            footer={
                <Legend mode={mode} isCompleting={suggestions.length > 0} hints={settings.hints} />
            }
        >
            <Timeline
                entries={entries}
                index={index}
                width={width}
                visible={visible}
                now={day === today ? clock : undefined}
                composing={composing}
                isSelecting={!(composing && composing.index === undefined)}
                gap={settings.gap}
                quiet={settings.quiet}
                clock={settings.clock}
            />
        </Frame>
    );
};

export default Journal;
