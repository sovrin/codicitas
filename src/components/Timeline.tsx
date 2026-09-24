import React from 'react';
import {Box, Text} from 'ink';
import Lead from './Lead';
import Line from './Line';
import Refs from './Refs';
import {styleOf, TAG_STYLE} from './tags';
import {useKnown} from '#/hooks';
import {leadOf} from '#/services/due';
import type {Entry, Priority, Tag} from '#/services/journal';
import type {Clock} from '#/services/settings';
import {clip} from '#/services/titles';
import {type Composing, focusOf, layout, viewport} from '#/services/timeline';
import {formatTime, timeWidth} from '#/utils';

type Props = {
    entries: Entry[];
    index: number;
    width: number;
    visible: number;
    /**
     * HH:MM on today, so the rail runs on to the present.
     */
    now?: string;
    /**
     * What due dates are counted from, on any day.
     */
    today?: string;
    composing?: Composing;
    /**
     * Whether the selection is shown: not while a new entry is written.
     */
    isSelecting: boolean;
    gap: number;
    quiet: boolean;
    clock: Clock;
};

const Glyph = ({tag, priority}: {tag: Tag; priority?: Priority}) => {
    const {glyph, color, dim} = styleOf(tag, priority);

    return (
        <Text color={color} dimColor={dim}>
            {glyph}
        </Text>
    );
};

/**
 * The day as a rail: times down the left, each entry's glyph on the line, the
 * quiet stretches between them spelled out, and - on today - the present at
 * the bottom, where the next entry is written.
 *
 * @param entries
 * @param index
 * @param width
 * @param visible
 * @param now
 * @param today
 * @param composing
 * @param isSelecting
 * @param gap
 * @param quiet
 * @param clock
 * @constructor
 */
const Timeline = ({
    entries,
    index,
    width,
    visible,
    now,
    today,
    composing,
    isSelecting,
    gap,
    quiet,
    clock,
}: Props) => {
    const titles = useKnown();
    const rows = layout({entries, width, now, composing, gap, quiet, titles, today});
    // where the rail runs: past the selection bar, the time and a space
    const blank = ' '.repeat(timeWidth(clock));
    const rail = ' '.repeat(2 + timeWidth(clock) + 1);

    if (rows.length === 0) {
        return <Text dimColor> nothing on this day</Text>;
    }

    const start = viewport(rows.length, focusOf(rows, index), visible);

    return (
        <Box flexDirection="column" height={visible} overflow="hidden">
            {rows.slice(start, start + visible).map((row, offset) => {
                const key = start + offset;

                switch (row.kind) {
                    case 'gap':
                        return (
                            <Text key={key} dimColor>
                                {rail}┆{row.label ? ` ${row.label}` : ''}
                            </Text>
                        );

                    case 'now':
                        return (
                            <Text key={key}>
                                <Text color="yellow">{`  ${formatTime(row.time, clock)} ● now`}</Text>
                                {entries.length === 0 && (
                                    <Text dimColor> i to write the first entry of the day</Text>
                                )}
                            </Text>
                        );

                    case 'draft':
                        return (
                            <Box key={key}>
                                <Text>
                                    {'▌ '}
                                    <Text dimColor>
                                        {row.isFirst ? formatTime(row.time, clock) : blank}{' '}
                                    </Text>
                                    {row.isFirst ? (
                                        <Glyph tag={row.tag} />
                                    ) : (
                                        <Text dimColor>│</Text>
                                    )}{' '}
                                </Text>
                                <Line text={row.text} column={row.cursor} ghost={row.ghost} />
                            </Box>
                        );

                    case 'entry': {
                        const isSelected = isSelecting && row.index === index;
                        const {italic} = TAG_STYLE[row.tag];
                        const lead = row.mark.length + leadOf(row.due).length;

                        return (
                            <Box key={key}>
                                <Text>
                                    <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                                    <Text dimColor>
                                        {row.isFirst ? formatTime(row.time, clock) : blank}{' '}
                                    </Text>
                                    {row.isFirst ? (
                                        <Glyph tag={row.tag} priority={row.priority} />
                                    ) : (
                                        <Text dimColor>│</Text>
                                    )}{' '}
                                </Text>
                                <Text wrap="truncate-end" bold={isSelected} italic={italic}>
                                    <Lead mark={row.mark} due={row.due} priority={row.priority} />
                                    {row.text.slice(lead) ? (
                                        <Refs
                                            text={row.text.slice(lead)}
                                            notes={clip(row.notes, lead)}
                                        />
                                    ) : (
                                        ' '
                                    )}
                                </Text>
                            </Box>
                        );
                    }
                }
            })}
        </Box>
    );
};

export default Timeline;
