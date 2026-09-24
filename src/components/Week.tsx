import React from 'react';
import {Text} from 'ink';
import type {WeekStart} from '#/services/settings';
import {fromKey, weekOf} from '#/utils';

const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type Props = {
    day: string;
    days: string[];
    start: WeekStart;
    narrow?: boolean;
};

/**
 * The week the day on screen falls in, the day itself in ink. In three
 * letters, or in one where the terminal is narrow.
 *
 * @param day
 * @param start
 * @param narrow
 * @constructor
 */
export const WeekNames = ({day, start, narrow = false}: Props) => (
    <Text>
        {weekOf(day, start).map((key, at) => (
            <Text key={key} bold={key === day} dimColor={key !== day}>
                {at > 0 && ' '}
                {NAMES[fromKey(key).getDay()].slice(0, narrow ? 1 : 3)}
            </Text>
        ))}
    </Text>
);

/**
 * Under each name, whether anything was written that day: ● yes, · no, ◉ the
 * day on screen. Each mark sits under the middle letter of its name, and the
 * line is as wide as the names, so the two stay aligned when right aligned.
 *
 * @param day
 * @param days
 * @param start
 * @param narrow
 * @constructor
 */
export const WeekMarks = ({day, days, start, narrow = false}: Props) => {
    const pad = narrow ? '' : ' ';

    return (
        <Text>
            {weekOf(day, start).map((key, at) => (
                <Text key={key} bold={key === day} dimColor={key !== day}>
                    {at > 0 && ' '}
                    {pad}
                    {key === day ? '◉' : days.includes(key) ? '●' : '·'}
                    {pad}
                </Text>
            ))}
        </Text>
    );
};
