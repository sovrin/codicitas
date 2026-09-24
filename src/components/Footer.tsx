import React from 'react';
import {Text} from 'ink';
import Hints from './Hints';
import type {Entry, Mode} from '#/services/journal';
import {quote, toHeadline} from '#/utils';

const HINTS: [string, string][] = [
    ['i', 'write'],
    ['x', 'tick'],
    ['u', 'undo'],
    ['/', 'search'],
    ['s', 'standup'],
    ['?', 'keys'],
];

const COMPOSE_HINTS: [string, string][] = [
    ['enter', 'save'],
    ['shift+enter', 'new line'],
    ['/todo', 'tag'],
    ['!h', 'priority'],
    ['@9:30', 'time'],
    ['esc', 'cancel'],
];

const COMPLETE_HINTS: [string, string][] = [
    ['tab', 'complete'],
    ['^n ^p', 'choose'],
    ['enter', 'save'],
    ['esc', 'cancel'],
];

const CONFIRM_HINTS: [string, string][] = [
    ['y', 'delete'],
    ['any other key', 'keeps it'],
];

const MOVE_HINTS: [string, string][] = [
    ['←→', 'day'],
    ['t', 'today'],
    ['enter', 'move'],
    ['esc', 'cancel'],
];

type StatusProps = {
    mode: Mode;
    entries: Entry[];
    notice?: string;
    today: string;
    /**
     * Names the @name or #topic being typed could become.
     */
    suggestions: string[];
    pick: number;
    /**
     * Columns to fill; a quoted entry is cut to fit rather than run off.
     */
    width: number;
};

/**
 * The row above the keys: what the journal is asking or saying right now -
 * a question, a notice, the names on offer. Blank when there is nothing.
 *
 * @param mode
 * @param entries
 * @param notice
 * @param today
 * @param suggestions
 * @param pick
 * @param width
 * @constructor
 */
export const Status = ({mode, entries, notice, today, suggestions, pick, width}: StatusProps) => {
    if (mode.kind === 'compose' && suggestions.length > 0) {
        return (
            <Text wrap="truncate-end">
                {suggestions.map((name, at) => (
                    <Text key={name} bold={at === pick} dimColor={at !== pick}>
                        {at > 0 && '  '}
                        {name}
                    </Text>
                ))}
            </Text>
        );
    }

    if (mode.kind === 'confirm') {
        const first = quote(entries[mode.index]?.text ?? '', width - 'delete ""?'.length);

        return (
            <Text wrap="truncate-end" color="red">
                delete "{first}"?
            </Text>
        );
    }

    if (mode.kind === 'move') {
        const target = toHeadline(mode.target, today);
        const first = quote(
            entries[mode.index]?.text ?? '',
            width - 'move "" to ‹  ›'.length - target.length,
        );

        return (
            <Text wrap="truncate-end">
                move "{first}" to{' '}
                <Text bold>
                    <Text dimColor>‹ </Text>
                    {target}
                    <Text dimColor> ›</Text>
                </Text>
            </Text>
        );
    }

    if (notice) {
        return <Text wrap="truncate-end">{notice}</Text>;
    }

    return null;
};

type LegendProps = {
    mode: Mode;
    /**
     * Whether a completion is on offer, which changes what tab does.
     */
    isCompleting: boolean;
    hints: boolean;
};

/**
 * The bottom row: which keys do what, for whatever is going on. The idle hints
 * can be turned off in settings; what a question or writing needs never is.
 *
 * @param mode
 * @param isCompleting
 * @param hints
 * @constructor
 */
export const Legend = ({mode, isCompleting, hints}: LegendProps) => {
    switch (mode.kind) {
        case 'compose':
            return <Hints hints={isCompleting ? COMPLETE_HINTS : COMPOSE_HINTS} />;

        case 'confirm':
            return <Hints hints={CONFIRM_HINTS} />;

        case 'move':
            return <Hints hints={MOVE_HINTS} />;

        default:
            return <Hints hints={HINTS} hidden={!hints} />;
    }
};
