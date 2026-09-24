import {useMemo} from 'react';
import {isEmpty, parse} from '#/services/search';
import * as store from '#/services/store';

/**
 * Results for the search line, looked up on every change. The database is
 * local and synchronous, so there is nothing to debounce.
 *
 * @param text
 * @param revision read again whenever this changes
 */
const useSearch = (text: string, revision: number) =>
    useMemo(() => {
        const query = parse(text);

        return {
            query,
            results: isEmpty(query) ? [] : store.search(query.terms, query.tag, query.priority),
        };
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [text, revision]);

export default useSearch;
