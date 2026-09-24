import React, {type ReactNode, useState} from 'react';
import {Box, type Key, Text, useInput, usePaste} from 'ink';
import Entries from './Entries';
import Frame from './Frame';
import Hints from './Hints';
import Line from './Line';
import type {Preferences} from '#/hooks/useSettings';
import type {Definition} from '#/services/definition';
import {type Draft, draft, insert} from '#/services/editor';
import {edit, isNewline, repeats} from '#/services/input';
import type {Settings} from '#/services/settings';
import {spaced} from '#/utils';

const NONE: string[] = [];

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
    /**
     * Every topic in the journal, for a setting that gives names to things
     * to offer the names already in use.
     */
    topics?: string[];
};

/**
 * Settings with their current values. Changing one saves it, so leaving is
 * all there is to do afterwards. The few that are typed are saved on enter.
 * Settings something cannot do without come first, apart from the rest, and
 * one still missing its value says so in yellow.
 *
 * @param props
 * @constructor
 */
const Options = ({
    title,
    subtitle,
    definitions,
    preferences,
    status,
    hints,
    onKey,
    topics = NONE,
}: Props) => {
    const {settings, adjust, set} = preferences;
    const [selected, setSelected] = useState(0);
    const [typing, setTyping] = useState<Draft>();
    // a setting that gives names to things, open on a page of its own
    const [opened, setOpened] = useState<Definition<Settings>>();
    const required = definitions.filter(({missing}) => missing);
    const optional = definitions.filter(({missing}) => !missing);
    // headings only where there is something to tell apart
    const split = required.length > 0 && optional.length > 0;
    const listing = split ? [...required, ...optional] : definitions;
    const {id, description, values, entries} = listing[selected];
    const width = Math.max(...listing.map(({label}) => label.length)) + 4;

    usePaste(
        (text) => {
            if (typing) {
                setTyping(insert(typing, text.replace(/[\r\n]+/g, '')));
            }
        },
        {isActive: !opened},
    );

    useInput(
        (input, key) => {
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
                if (entries) {
                    if (key.return || key.rightArrow || input === 'l') {
                        setOpened(listing[selected]);
                    }
                } else if (values) {
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
                setSelected(Math.max(0, Math.min(listing.length - 1, selected + delta)));
            }
        },
        {isActive: !opened},
    );

    if (opened) {
        return (
            <Entries
                title={title}
                label={opened.label}
                kind={opened.entries}
                value={settings[opened.id] as Record<string, string>}
                onChange={(next) => set(opened.id, next as never)}
                topics={topics}
                onBack={() => setOpened(undefined)}
            />
        );
    }

    return (
        <Frame title={title} subtitle={subtitle} footer={<Hints hints={typing ? TYPING : hints} />}>
            <Box flexDirection="column">
                {listing.map(({id: key, label, format, secret, missing}, at) => {
                    const isSelected = at === selected;
                    const value = format(settings[key] as never);
                    const isMissing = missing?.(settings[key] as never);
                    const heading = !split
                        ? undefined
                        : at === 0
                          ? 'required'
                          : at === required.length
                            ? 'optional'
                            : undefined;
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
                                <Text color={isMissing ? 'yellow' : undefined}>{value}</Text>
                                <Text dimColor> ›</Text>
                            </Text>
                        ) : (
                            <Text dimColor={!isMissing} color={isMissing ? 'yellow' : undefined}>
                                {'  '}
                                {value}
                            </Text>
                        );

                    return (
                        <Box key={key} flexDirection="column">
                            {heading && (
                                <Text bold>
                                    {at > 0 ? '\n' : ''}
                                    {'  '}
                                    {spaced(heading)}
                                </Text>
                            )}
                            <Box>
                                <Text>
                                    <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                                    <Text bold={isSelected}>{label.padEnd(width)}</Text>
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
                    {!values && !typing && (
                        <Text dimColor>
                            {'  '}
                            {entries ? 'Enter to change them.' : 'Enter to type it.'}
                        </Text>
                    )}
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
