import {useMemo} from 'react';
import {backlog} from '#/services/due';
import * as store from '#/services/store';

/**
 * Every todo still open, from any day, in the order they want doing.
 *
 * @param today what is due is counted from
 * @param revision read again whenever this changes
 */
const useOpenTodos = (today: string, revision: number) =>
    // the revision is not read, it only says the database changed
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => backlog(store.openTodos(), today), [today, revision]);

export default useOpenTodos;
