import React, {useContext, useState} from 'react';
import {Box, Text, useApp, useInput, usePaste} from 'ink';
import type {ViewProps} from '#/components/App';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Line from '#/components/Line';
import {type Connection, TicketsContext} from '#/hooks';
import {type Draft, draft, insert} from '#/services/editor';
import {edit, isNewline, repeats} from '#/services/input';
import {SETTINGS} from '#/services/settings';
import {spaced} from '#/utils';

const HINTS: [string, string][] = [
    ['↑↓', 'choose'],
    ['←→', 'change'],
    ['esc', 'back'],
];

const TYPING: [string, string][] = [
    ['enter', 'save'],
    ['esc', 'cancel'],
];

const WIDTH = Math.max(...SETTINGS.map(({label}) => label.length)) + 4;

/**
 * How asking Jira went, said under its settings once there is something to
 * say.
 */
const CONNECTION: Partial<Record<Connection, {text: string; color?: string}>> = {
    ok: {text: 'Jira answered; titles show after their tickets.', color: 'green'},
    refused: {text: 'Jira turned the token down. Check the email and token.', color: 'red'},
    unreachable: {
        text: 'Jira could not be reached. Trying again in a few minutes.',
        color: 'yellow',
    },
};

/**
 * Every setting with its current value. Changing one saves it, so leaving is
 * all there is to do afterwards. The few that are typed are saved on enter.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Settings = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {dispatch} = journal;
    const {settings, adjust, set} = preferences;
    const {connection} = useContext(TicketsContext);
    const [selected, setSelected] = useState(0);
    const [typing, setTyping] = useState<Draft>();
    const {id, description, values} = SETTINGS[selected];
    const isJira = id.startsWith('jira');

    usePaste((text) => {
        if (typing) {
            setTyping(insert(typing, text.replace(/[\r\n]+/g, '')));
        }
    });

    useInput((input, key) => {
        if (typing) {
            if (key.escape) {
                setTyping(undefined);
            } else if (key.return && !isNewline(input, key)) {
                set(id, typing.buffer.trim() as never);
                setTyping(undefined);
            } else if (!isNewline(input, key) && !key.tab && !key.upArrow && !key.downArrow) {
                const next = edit(typing, input, key, Infinity);

                if (next) {
                    setTyping(next);
                }
            }

            return;
        }

        if (key.escape || input === ',') {
            dispatch({type: 'view', view: 'journal'});

            return;
        }

        if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();

            return;
        }

        if (
            key.leftArrow ||
            key.rightArrow ||
            key.return ||
            input === 'h' ||
            input === 'l' ||
            input === ' '
        ) {
            if (values) {
                adjust(id, key.leftArrow || input === 'h' ? -1 : 1);
            } else {
                setTyping(draft(settings[id] as string));
            }

            return;
        }

        const delta =
            (key.downArrow ? 1 : 0) -
            (key.upArrow ? 1 : 0) +
            repeats(input, 'j') -
            repeats(input, 'k');

        if (delta !== 0) {
            setSelected(Math.max(0, Math.min(SETTINGS.length - 1, selected + delta)));
        }
    });

    const status = isJira ? CONNECTION[connection] : undefined;

    return (
        <Frame
            title={<Text bold>Settings</Text>}
            subtitle={<Text dimColor>Saved as you change them</Text>}
            footer={<Hints hints={typing ? TYPING : HINTS} />}
        >
            <Box flexDirection="column">
                {SETTINGS.map(({id: key, label, format, section: heading}, at) => {
                    const isSelected = at === selected;
                    const value = format(settings[key] as never);
                    const shown =
                        isSelected && typing ? (
                            // a token is not shown even while it is typed
                            <Line
                                text={
                                    key === 'jiraToken'
                                        ? '•'.repeat(Array.from(typing.buffer).length)
                                        : typing.buffer
                                }
                                column={typing.cursor}
                            />
                        ) : isSelected ? (
                            <Text bold>
                                <Text dimColor>‹ </Text>
                                {value}
                                <Text dimColor> ›</Text>
                            </Text>
                        ) : (
                            <Text dimColor>
                                {'  '}
                                {value}
                            </Text>
                        );

                    return (
                        <Box key={key} flexDirection="column">
                            {heading && (
                                <Text bold>
                                    {'\n  '}
                                    {spaced(heading)}
                                </Text>
                            )}
                            <Box>
                                <Text>
                                    <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                                    <Text bold={isSelected}>{label.padEnd(WIDTH)}</Text>
                                </Text>
                                {isSelected && typing ? <Text>{'  '}</Text> : null}
                                {shown}
                            </Box>
                        </Box>
                    );
                })}

                <Box marginTop={1} flexDirection="column">
                    <Text dimColor wrap="wrap">
                        {'  '}
                        {description}
                    </Text>
                    {!values && !typing && <Text dimColor>{'  '}Enter to type it.</Text>}
                    {status && (
                        <Text color={status.color} wrap="wrap">
                            {'  '}
                            {status.text}
                        </Text>
                    )}
                </Box>
            </Box>
        </Frame>
    );
};

export default Settings;
