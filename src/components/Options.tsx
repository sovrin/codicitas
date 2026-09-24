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

/**
 * The heading a setting is listed under.
 *
 * @param definition
 */
const groupOf = ({missing, group}: Definition<Settings>): string =>
    missing ? 'required' : (group ?? 'optional');

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
    // what cannot be done without first, then the rest by their headings, in
    // the order they first come
    const groups = [...new Set(['required', ...definitions.map(groupOf)])].filter((group) =>
        definitions.some((definition) => groupOf(definition) === group),
    );
    const listing = groups.flatMap((group) =>
        definitions.filter((definition) => groupOf(definition) === group),
    );
    // headings only where there is something to tell apart
    const split = groups.length > 1;
    const {id, description, values, entries, fallback, preview} = listing[selected];
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
                    // a template left empty is typed over from its default
                    setTyping(draft((settings[id] as string) || fallback || ''));
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
                    const group = groupOf(listing[at]);
                    const heading =
                        split && (at === 0 || groupOf(listing[at - 1]) !== group)
                            ? group
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
                    {preview && (
                        <Text wrap="wrap">
                            <Text dimColor>{'  '}Looks like </Text>
                            {preview((typing ? typing.buffer : settings[id]) as never)}
                        </Text>
                    )}
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
