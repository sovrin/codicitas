import React from 'react';
import {Text} from 'ink';
import {count, type Entry} from '#/services/journal';

/**
 * Where the day stands, in words: "2 done · 1 open · 1 blocked". Only what
 * settles or needs you is counted; notes, meetings and learnings are the
 * day's texture, not its score.
 *
 * @param entries
 * @constructor
 */
const Summary = ({entries}: {entries: Entry[]}) => {
    const counts = count(entries);
    const parts = [
        counts.done && (
            <Text key="done" dimColor>
                {counts.done} done
            </Text>
        ),
        counts.todo && (
            <Text key="todo" color="yellow">
                {counts.todo} open
            </Text>
        ),
        counts.blocked && (
            <Text key="blocked" color="red">
                {counts.blocked} blocked
            </Text>
        ),
    ].filter(Boolean);

    if (parts.length === 0) {
        return (
            <Text dimColor>
                {entries.length === 0 ? 'nothing written yet' : `${entries.length} written`}
            </Text>
        );
    }

    return (
        <Text>
            {parts.map((part, at) => (
                <Text key={at}>
                    {at > 0 && <Text dimColor> · </Text>}
                    {part}
                </Text>
            ))}
        </Text>
    );
};

export default Summary;
