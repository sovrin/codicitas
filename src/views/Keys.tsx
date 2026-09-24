import React, {type ReactNode, useState} from 'react';
import {Text, useApp, useInput} from 'ink';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import {bodyRows} from '#/components/layout';
import {useSize} from '#/hooks';
import type {ViewProps} from '#/components/App';
import {spaced} from '#/utils';

const GROUPS: [string, [string, string][]][] = [
    [
        'journal',
        [
            ['i  enter', 'write a new entry'],
            ['e', 'edit the selected entry'],
            ['x  space', 'tick a todo off, or back on'],
            ['d', 'delete the selected entry'],
            ['m', 'move the selected entry to another day'],
            ['+ -', "raise or lower a todo's priority"],
            ['u', 'undo the last change'],
            ['j k  ↑ ↓', 'move through the day'],
            ['h l  ← →', 'previous and next day with entries'],
            ['t', 'back to today'],
            ['o', 'open todos from every day'],
            ['s', 'standup'],
            [',', 'settings'],
            ['/', 'search every day'],
            ['#', "search for the entry's first #topic or ticket"],
            ['@', 'search for the first @colleague it mentions'],
            ['r', "refresh the Jira titles of the day's tickets"],
            ['q', 'quit'],
        ],
    ],
    [
        'writing',
        [
            ['enter', 'save'],
            ['shift/alt+enter  ctrl+j', 'new line'],
            ['tab  shift+tab', 'indent and outdent'],
            ['/todo  /d  /b', 'tag the entry, at the very start'],
            ['@10:30  @9:05pm', 'set when it happened, on either clock'],
            ['!c  !h  !m  !l', 'critical, high, mid or low priority'],
            ['ctrl+t', 'next tag'],
            ['tab  →', 'complete the @colleague or #topic being typed'],
            ['ctrl+n  ctrl+p', 'choose another completion'],
            ['ctrl+w  ctrl+u  ctrl+k', 'delete word, to line start, to line end'],
            ['esc', 'cancel'],
        ],
    ],
    [
        'elsewhere',
        [
            ['y', 'copy the standup'],
            ['enter', 'open a search result or todo on its day'],
            ['esc', 'back to the journal'],
        ],
    ],
];

/**
 * Flattened to rows, each group's keys padded to its own longest, so the
 * screen scrolls by line on a short terminal.
 */
const LINES: ReactNode[] = GROUPS.flatMap(([title, keys], at) => {
    const width = Math.max(...keys.map(([key]) => key.length)) + 3;

    return [
        ...(at > 0 ? [<Text key={`${title}-gap`}> </Text>] : []),
        <Text key={title} bold>
            {spaced(title)}
        </Text>,
        ...keys.map(([key, label]) => (
            <Text key={`${title}-${key}`} wrap="truncate-end">
                {'  '}
                {key.padEnd(width)}
                <Text dimColor>{label}</Text>
            </Text>
        )),
    ];
});

/**
 * Every key, for when the footer's six are not enough.
 *
 * @param journal
 * @constructor
 */
const Keys = ({journal}: ViewProps) => {
    const {exit} = useApp();
    const {rows} = useSize();
    const {dispatch} = journal;
    const [offset, setOffset] = useState(0);
    const visible = bodyRows(rows, 1);
    const limit = Math.max(0, LINES.length - visible);
    const top = Math.min(offset, limit);

    useInput((input, key) => {
        if (key.downArrow || input === 'j') {
            setOffset(Math.min(limit, top + 1));

            return;
        }

        if (key.upArrow || input === 'k') {
            setOffset(Math.max(0, top - 1));

            return;
        }

        if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();

            return;
        }

        if (key.escape || input === '?' || key.return) {
            dispatch({type: 'view', view: 'journal'});
        }
    });

    return (
        <Frame
            title={<Text bold>Keys</Text>}
            footer={
                <Hints
                    hints={
                        limit > 0
                            ? [
                                  ['j k', 'scroll'],
                                  ['esc', 'back'],
                              ]
                            : [['esc', 'back']]
                    }
                />
            }
        >
            {LINES.slice(top, top + visible)}
        </Frame>
    );
};

export default Keys;
