import React from 'react';
import {Box, Text, useInput, usePaste} from 'ink';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Line from '#/components/Line';
import Results from '#/components/Results';
import {bodyRows, contentWidth} from '#/components/layout';
import {useSearch, useSize} from '#/hooks';
import type {ViewProps} from '#/components/App';
import {insert} from '#/services/editor';
import {edit, isNewline} from '#/services/input';
import {SEARCH_LIMIT} from '#/const';

const HINTS: [string, string][] = [
    ['↑↓', 'pick'],
    ['enter', 'open'],
    ['/todo', 'by tag'],
    ['esc', 'back'],
];

/**
 * Every day at once, narrowed as you type.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Search = ({journal, preferences}: ViewProps) => {
    const {columns, rows} = useSize();
    const {state, dispatch, open, revision} = journal;
    const {query, found} = state;
    const {query: parsed, results} = useSearch(query.buffer, revision);
    const visible = bodyRows(rows, 1);

    // one line only: a pasted paragraph is searched for as words
    usePaste((text) => {
        dispatch({type: 'query', draft: insert(query, text.replace(/\s+/g, ' '))});
    });

    useInput((input, key) => {
        if (key.escape) {
            dispatch({type: 'view', view: 'journal'});

            return;
        }

        if (key.return && !isNewline(input, key)) {
            const result = results[found];

            if (result) {
                open(result.day, result.id);
            }

            return;
        }

        if (key.upArrow || key.downArrow || (key.ctrl && (input === 'p' || input === 'n'))) {
            const delta = key.upArrow || input === 'p' ? -1 : 1;

            dispatch({type: 'found', delta, total: results.length});

            return;
        }

        if (key.tab || isNewline(input, key)) {
            return;
        }

        const next = edit(query, input, key, contentWidth(columns));

        if (next !== undefined) {
            dispatch({type: 'query', draft: next});
        }
    });

    const body = (() => {
        if (query.buffer.trim().length === 0) {
            return (
                <Text dimColor>Type to search every day. Start with /todo to narrow by tag.</Text>
            );
        }

        if (results.length === 0) {
            return <Text dimColor>Nothing matches. Fewer words find more.</Text>;
        }

        return (
            <Results
                results={results}
                selected={found}
                visible={visible}
                today={state.today}
                clock={preferences.settings.clock}
                terms={parsed.terms}
            />
        );
    })();

    return (
        <Frame
            title={<Text bold>Search</Text>}
            subtitle={
                <Text dimColor>
                    {results.length === SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : results.length}{' '}
                    {results.length === 1 ? 'match' : 'matches'}
                </Text>
            }
            status={
                <Box>
                    <Text dimColor>/ </Text>
                    <Line text={query.buffer} column={query.cursor} />
                </Box>
            }
            footer={<Hints hints={HINTS} hidden={!preferences.settings.hints} />}
        >
            {body}
        </Frame>
    );
};

export default Search;
