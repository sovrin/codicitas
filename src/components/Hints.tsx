import React from 'react';
import {Text} from 'ink';

type Props = {
    hints: [string, string][];
    /**
     * Keeps the row, so the frame does not jump when hints are turned off.
     */
    hidden?: boolean;
};

/**
 * One line that truncates: a row of boxes wraps mid word once the terminal
 * gets narrow, which is unreadable. Keys in ink, what they do in graphite.
 *
 * @param hints
 * @param hidden
 * @constructor
 */
const Hints = ({hints, hidden}: Props) =>
    hidden ? (
        <Text> </Text>
    ) : (
        <Text wrap="truncate-end">
            {hints.map(([key, label], at) => (
                <Text key={key}>
                    {at > 0 && '   '}
                    <Text>{key}</Text>
                    <Text dimColor> {label}</Text>
                </Text>
            ))}
        </Text>
    );

export default Hints;
