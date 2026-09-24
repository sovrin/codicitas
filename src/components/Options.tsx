import React, {type ReactNode, useState} from 'react';
import {Box, type Key, Text, useInput, usePaste} from 'ink';
import Frame from './Frame';
import Hints from './Hints';
import Line from './Line';
import type {Preferences} from '#/hooks/useSettings';
import type {Definition} from '#/services/definition';
import {type Draft, draft, insert} from '#/services/editor';
import {edit, isNewline, repeats} from '#/services/input';
import type {Settings} from '#/services/settings';

const TYPING: [string, string][] = [
    ['enter', 'save'],
    ['esc', 'cancel'],
];

export type Said = {
    text: string;
    color?: string;
};

type Props = {
    title: ReactNode;
    subtitle?: ReactNode;
    definitions: Definition<Settings>[];
    preferences: Preferences;
    /**
     * Said under the description, like how asking a module went.
     */
    status?: Said;
    hints: [string, string][];
    /**
     * The page's own keys, tried first while nothing is being typed; true
     * when the key was one of them.
     */
    onKey: (input: string, key: Key) => boolean;
};

/**
 * Settings with their current values. Changing one saves it, so leaving is
 * all there is to do afterwards. The few that are typed are saved on enter.
 *
 * @param props
 * @constructor
 */
const Options = ({title, subtitle, definitions, preferences, status, hints, onKey}: Props) => {
    const {settings, adjust, set} = preferences;
    const [selected, setSelected] = useState(0);
    const [typing, setTyping] = useState<Draft>();
    const {id, description, values} = definitions[selected];
    const width = Math.max(...definitions.map(({label}) => label.length)) + 4;

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

        if (onKey(input, key)) {
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
            setSelected(Math.max(0, Math.min(definitions.length - 1, selected + delta)));
        }
    });

    return (
        <Frame title={title} subtitle={subtitle} footer={<Hints hints={typing ? TYPING : hints} />}>
            <Box flexDirection="column">
                {definitions.map(({id: key, label, format, secret}, at) => {
                    const isSelected = at === selected;
                    const value = format(settings[key] as never);
                    const shown =
                        isSelected && typing ? (
                            // a token is not shown even while it is typed
                            <Line
                                text={
                                    secret
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
                        <Box key={key}>
                            <Text>
                                <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                                <Text bold={isSelected}>{label.padEnd(width)}</Text>
                            </Text>
                            {isSelected && typing ? <Text>{'  '}</Text> : null}
                            {shown}
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

export default Options;
