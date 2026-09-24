import React from 'react';
import {Text} from 'ink';
import chalk from 'chalk';

type Props = {
    text: string;
    /**
     * Where the block cursor is drawn, if on this row.
     */
    column?: number;
    /**
     * A completion on offer: drawn dimmed from the cursor on, the cursor
     * resting on its first character, the way a shell suggests.
     */
    ghost?: string;
};

/**
 * One row of the prompt. The app owns the keyboard, so this only draws.
 *
 * @param text
 * @param column
 * @param ghost
 * @constructor
 */
const Line = ({text, column, ghost}: Props) => {
    if (column === undefined) {
        return <Text wrap="truncate-end">{text || ' '}</Text>;
    }

    const list = Array.from(text);

    if (ghost) {
        const [first, ...rest] = Array.from(ghost);

        return (
            <Text wrap="truncate-end">
                {list.slice(0, column).join('')}
                {chalk.inverse(first)}
                <Text dimColor>{rest.join('')}</Text>
                {list.slice(column).join('')}
            </Text>
        );
    }

    return (
        <Text wrap="truncate-end">
            {list.slice(0, column).join('')}
            {chalk.inverse(list[column] ?? ' ')}
            {list.slice(column + 1).join('')}
        </Text>
    );
};

export default Line;
