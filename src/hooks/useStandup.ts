import {useMemo} from 'react';
import {backlog} from '#/services/due';
import {standup} from '#/services/standup';
import * as store from '#/services/store';

/**
 * The standup as of today: the last day journaled before it and today, plus
 * every todo still open.
 *
 * @param today
 * @param revision read again whenever this changes
 */
const useStandup = (today: string, revision: number) =>
    useMemo(() => {
        const since = store.previousDay(today);
        const recent = [since, today]
            .filter(Boolean)
            .flatMap((day) => store.load(day).map((entry) => ({...entry, day})));

        return {since, sections: standup(recent, backlog(store.openTodos(), today))};
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [today, revision]);

export default useStandup;
