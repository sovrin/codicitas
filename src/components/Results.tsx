import React from 'react';
import {Box, Text} from 'ink';
import Refs from './Refs';
import {styleOf} from './tags';
import {useTitles} from '#/hooks';
import {markOf, MID, PRIORITIES} from '#/services/journal';
import {highlight, snippet} from '#/services/search';
import type {Clock} from '#/services/settings';
import type {Found} from '#/services/store';
import {annotate, clip} from '#/services/titles';
import {viewport} from '#/services/timeline';
import {formatTime, spaced, toHeadline, toShortLabel} from '#/utils';

type Props = {
    results: Found[];
    selected: number;
    visible: number;
    today: string;
    clock: Clock;
    /**
     * Marked where they occur, and deciding which line of a multi line entry
     * is shown.
     */
    terms?: string[];
    /**
     * Gathered under the day they were written on, or - for a backlog - under
     * their priority, each row then saying its day. Results arrive sorted
     * that way, so a new heading means a new group.
     */
    group?: 'day' | 'priority';
};

type Row =
    | {kind: 'gap'}
    | {kind: 'heading'; text: string; isSpaced: boolean}
    | {kind: 'result'; index: number};

/**
 * Entries from any day, gathered into groups, one line each.
 *
 * @param results
 * @param selected
 * @param visible
 * @param today
 * @param clock
 * @param terms
 * @param group
 * @constructor
 */
const NONE: string[] = [];

const Results = ({
    results,
    selected,
    visible,
    today,
    clock,
    terms = NONE,
    group = 'day',
}: Props) => {
    const titles = useTitles();
    const heading = ({day, priority = MID}: Found) =>
        group === 'day' ? toHeadline(day, today) : PRIORITIES[priority - 1].name;
    const dayWidth = Math.max(0, ...results.map(({day}) => toShortLabel(day).length));
    const rows: Row[] = [];

    results.forEach((result, index) => {
        if (index === 0 || heading(result) !== heading(results[index - 1])) {
            rows.push(...(index > 0 ? [{kind: 'gap'} as const] : []), {
                kind: 'heading',
                text: heading(result),
                isSpaced: group === 'priority',
            });
        }

        rows.push({kind: 'result', index});
    });

    // a result first in its group brings its heading into view with it
    const at = rows.findIndex((row) => row.kind === 'result' && row.index === selected);
    const focus = rows[at - 1]?.kind === 'heading' ? at - 1 : at;
    const start = viewport(rows.length, focus, visible);

    return (
        <Box flexDirection="column">
            {rows.slice(start, start + visible).map((row, offset) => {
                const key = start + offset;

                if (row.kind === 'gap') {
                    return <Text key={key}> </Text>;
                }

                if (row.kind === 'heading') {
                    return (
                        <Text key={key} bold>
                            {row.isSpaced ? spaced(row.text) : row.text}
                        </Text>
                    );
                }

                const result = results[row.index];
                const {day, time, tag, text, priority} = result;
                const {glyph, color, dim, italic} = styleOf(tag, priority);
                const mark = markOf(result);
                const isSelected = row.index === selected;
                const shown = annotate(snippet(text, terms), titles);
                let from = 0;

                return (
                    <Box key={key}>
                        <Text>
                            <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                            {group === 'priority' && (
                                <Text dimColor>{toShortLabel(day).padEnd(dayWidth)} </Text>
                            )}
                            <Text dimColor>{formatTime(time, clock)} </Text>
                            <Text color={color} dimColor={dim}>
                                {glyph}
                            </Text>{' '}
                        </Text>
                        <Text wrap="truncate-end" bold={isSelected} italic={italic}>
                            {mark && (
                                <Text color="yellow" bold={priority === 4}>
                                    {mark}
                                </Text>
                            )}
                            {highlight(shown.text, terms).map((part, index) => {
                                const before = from;

                                from += Array.from(part.text).length;

                                return part.isMatch ? (
                                    <Text key={index} underline bold>
                                        {part.text}
                                    </Text>
                                ) : (
                                    <Refs
                                        key={index}
                                        text={part.text}
                                        notes={clip(shown.notes, before, from)}
                                        bold={isSelected}
                                    />
                                );
                            })}
                        </Text>
                    </Box>
                );
            })}
        </Box>
    );
};

export default Results;
