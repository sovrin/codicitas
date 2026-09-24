import pkg from '../package.json' with {type: 'json'};

export const {name, version} = pkg;

export const DATA_DIR = 'codicitas';
export const DATABASE_FILE = 'journal.db';

/**
 * How often the header clock advances. It shows minutes, so this only has to
 * be fine enough not to lag visibly.
 */
export const TICK = 15_000;

/**
 * Search stops here; past it the query wants narrowing, not scrolling.
 */
export const SEARCH_LIMIT = 200;
