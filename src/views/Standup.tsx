import React, {type ReactNode, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Refs from '#/components/Refs';
import {bodyRows, contentWidth} from '#/components/layout';
import {styleOf, TAG_STYLE} from '#/components/tags';
import {useSize, useStandup, useKnown} from '#/hooks';
import type {ViewProps} from '#/components/App';
import {copy} from '#/services/clipboard';
import {wrap} from '#/services/editor';
import {markOf} from '#/services/journal';
import {toText} from '#/services/standup';
import {annotate, clip} from '#/services/titles';
import {spaced, toHeadline, toShortLabel} from '#/utils';

const HINTS: [string, string][] = [
    ['y', 'copy'],
    ['j k', 'scroll'],
    ['esc', 'back'],
    ['?', 'keys'],
];

/**
 * Entries sit under their heading, behind their glyph.
 */
const INDENT = 4;

/**
 * What to say at the standup, laid out like the message it will be pasted as.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Standup = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {columns, rows} = useSize();
    const {state, dispatch, revision} = journal;
    const {since, sections} = useStandup(state.today, revision);
    const [offset, setOffset] = useState(0);
    const visible = bodyRows(rows, 1);
    const window = since ?? state.today;
    const width = contentWidth(columns);
    const titles = useKnown();

    // flattened to rows first, so scrolling is by line however long an entry
    const lines: ReactNode[] = sections.flatMap(({title, entries}, at) => [
        ...(at > 0 ? [<Text key={`${title}-gap`}> </Text>] : []),
        <Text key={title} bold>
            {spaced(title)}
        </Text>,
        ...(entries.length === 0
            ? [
                  <Text key={`${title}-none`} dimColor>
                      {'  nothing'}
                  </Text>,
              ]
            : entries.flatMap((entry) => {
                  const {id, day, text, priority} = entry;
                  const {glyph, color, dim} = styleOf(entry.tag, priority);
                  const mark = markOf(entry);
                  // an old todo says how long it has been waiting
                  const waiting = day < window ? `waiting since ${toShortLabel(day)}` : undefined;
                  const annotated = annotate(mark + text, titles);
                  const segments = wrap(
                      annotated.text,
                      Math.max(10, width - INDENT - (waiting ? waiting.length + 2 : 0)),
                  );

                  return segments.map((segment, row) => (
                      <Box key={`${id}-${segment.start}`} justifyContent="space-between">
                          <Text wrap="truncate-end">
                              {row === 0 ? (
                                  <Text>
                                      {'  '}
                                      <Text color={color} dimColor={dim}>
                                          {glyph}
                                      </Text>{' '}
                                  </Text>
                              ) : (
                                  ' '.repeat(INDENT)
                              )}
                              {row === 0 && mark && (
                                  <Text color="yellow" bold={priority === 4}>
                                      {mark}
                                  </Text>
                              )}
                              <Refs
                                  text={row === 0 ? segment.text.slice(mark.length) : segment.text}
                                  notes={clip(
                                      annotated.notes,
                                      segment.start + (row === 0 ? mark.length : 0),
                                      segment.end,
                                  )}
                              />
                          </Text>
                          {row === 0 && waiting && <Text dimColor>{waiting}</Text>}
                      </Box>
                  ));
              })),
    ]);

    const limit = Math.max(0, lines.length - visible);
    const top = Math.min(offset, limit);
    const counts = sections.map(({title, tag, entries}) => (
        <Text
            key={title}
            color={entries.length > 0 ? TAG_STYLE[tag].color : undefined}
            dimColor={entries.length === 0 || tag === 'done'}
        >
            {entries.length} {title}
        </Text>
    ));

    useInput((input, key) => {
        if (state.notice) {
            dispatch({type: 'notice'});
        }

        if (key.escape || input === 's') {
            dispatch({type: 'view', view: 'journal'});

            return;
        }

        if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();

            return;
        }

        if (input === '?') {
            dispatch({type: 'view', view: 'keys'});

            return;
        }

        if (input === 'y' || input === 'c') {
            const result = copy(toText(sections, titles));

            dispatch({
                type: 'notice',
                text:
                    result === 'copied'
                        ? 'Standup copied'
                        : 'Standup sent to the terminal clipboard',
            });

            return;
        }

        if (key.downArrow || input === 'j') {
            setOffset(Math.min(limit, top + 1));
        } else if (key.upArrow || input === 'k') {
            setOffset(Math.max(0, top - 1));
        }
    });

    return (
        <Frame
            title={<Text bold>Standup</Text>}
            subtitle={counts.map((count, at) => (
                <Text key={at}>
                    {at > 0 && <Text dimColor> · </Text>}
                    {count}
                </Text>
            ))}
            aside={
                <Text dimColor>
                    {since ? `since ${toHeadline(since, state.today)}` : 'today only'}
                </Text>
            }
            status={state.notice && <Text wrap="truncate-end">{state.notice}</Text>}
            footer={<Hints hints={HINTS} hidden={!preferences.settings.hints} />}
        >
            {lines.slice(top, top + visible)}
        </Frame>
    );
};

export default Standup;
