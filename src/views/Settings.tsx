import React from 'react';
import {Text, useApp} from 'ink';
import type {ViewProps} from '#/components/App';
import Options from '#/components/Options';
import {GENERAL} from '#/services/settings';

const HINTS: [string, string][] = [
    ['↑↓', 'choose'],
    ['←→', 'change'],
    ['tab', 'modules'],
    ['esc', 'back'],
];

/**
 * The settings of codicitas itself. Modules have a page of their own, a tab
 * away.
 *
 * @param journal
 * @param preferences
 * @constructor
 */
const Settings = ({journal, preferences}: ViewProps) => {
    const {exit} = useApp();
    const {dispatch} = journal;

    return (
        <Options
            title={<Text bold>Settings</Text>}
            subtitle={<Text dimColor>Saved as you change them</Text>}
            definitions={GENERAL}
            preferences={preferences}
            hints={HINTS}
            onKey={(input, key) => {
                if (key.escape || input === ',') {
                    dispatch({type: 'view', view: 'journal'});
                } else if (key.tab) {
                    dispatch({type: 'view', view: 'modules'});
                } else if (input === 'q' || (key.ctrl && input === 'd')) {
                    exit();
                } else {
                    return false;
                }

                return true;
            }}
        />
    );
};

export default Settings;
