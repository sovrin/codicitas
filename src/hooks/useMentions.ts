import {useMemo} from 'react';
import * as store from '#/services/store';

/**
 * The colleagues and topics used so far, most used first, for completion.
 *
 * @param revision read again whenever this changes
 */
const useMentions = (revision: number) =>
    useMemo(
        () => ({
            person: store.known('person'),
            topic: store.known('topic'),
        }),
        // the revision is not read, it only says the database changed
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [revision],
    );

export default useMentions;
