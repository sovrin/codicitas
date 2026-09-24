import React from 'react';
import {TicketsContext, useJournal, useNow, useSettings, useTickets} from '#/hooks';
import type {Journal as State} from '#/hooks/useJournal';
import type {Preferences} from '#/hooks/useSettings';
import type {View} from '#/services/journal';
import {toKey} from '#/utils';
import Journal from '#/views/Journal';
import Keys from '#/views/Keys';
import Open from '#/views/Open';
import Search from '#/views/Search';
import Settings from '#/views/Settings';
import Standup from '#/views/Standup';

export type ViewProps = {
    journal: State;
    preferences: Preferences;
};

const VIEWS: Record<View, (props: ViewProps) => React.JSX.Element> = {
    journal: Journal,
    standup: Standup,
    search: Search,
    open: Open,
    keys: Keys,
    settings: Settings,
};

type Props = {
    /**
     * Pins today, for tests; otherwise it follows the clock.
     */
    today?: string;
};

/**
 * One journal, several ways of looking at it. Only the current view is
 * mounted, so only its keyboard reader is listening.
 *
 * @param today
 * @constructor
 */
const App = ({today}: Props) => {
    const now = useNow();
    const journal = useJournal(today ?? toKey(now));
    const preferences = useSettings();
    const tickets = useTickets(preferences.settings, journal.revision);
    const Current = VIEWS[journal.state.view];

    return (
        <TicketsContext.Provider value={tickets}>
            <Current journal={journal} preferences={preferences} />
        </TicketsContext.Provider>
    );
};

export default App;
