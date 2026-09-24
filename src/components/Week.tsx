import React from 'react';
import {Text} from 'ink';
import type {WeekStart} from '#/services/settings';
import {fromKey, weekOf} from '#/utils';

const NAMES = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];

type Props = {
    day: string;
    days: string[];
    start: WeekStart;
};

/**
 * The week the day on screen falls in, the day itself in ink.
 *
 * @param day
 * @param start
 * @constructor
 */
export const WeekNames = ({day, start}: Props) => (
    <Text>
        {weekOf(day, start).map((key, at) => (
            <Text key={key} bold={key === day} dimColor={key !== day}>
                {at > 0 && ' '}
                {NAMES[fromKey(key).getDay()]}
            </Text>
        ))}
    </Text>
);

/**
 * Under each name, whether anything was written that day: ● yes, · no, ◉ the
 * day on screen. As wide as the names, so the two lines stay aligned when
 * right aligned.
 *
 * @param day
 * @param days
 * @param start
 * @constructor
 */
export const WeekMarks = ({day, days, start}: Props) => (
    <Text>
        {weekOf(day, start).map((key, at) => (
            <Text key={key} bold={key === day} dimColor={key !== day}>
                {key === day ? '◉' : days.includes(key) ? '●' : '·'}
                {at < 6 ? '  ' : ' '}
            </Text>
        ))}
    </Text>
);
