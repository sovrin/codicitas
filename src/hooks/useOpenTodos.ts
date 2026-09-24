import {useMemo} from 'react';
import * as store from '#/services/store';

/**
 * Every todo still open, from any day.
 *
 * @param revision read again whenever this changes
 */
const useOpenTodos = (revision: number) =>
    // the revision is not read, it only says the database changed
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => store.openTodos(), [revision]);

export default useOpenTodos;
