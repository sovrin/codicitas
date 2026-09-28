import {createContext, useContext} from 'react';

/**
 * What code is drawn on: a shade just off the terminal's background, asked
 * for once before the first frame, and nothing where the terminal didn't say.
 */
export const TintContext = createContext<string | undefined>(undefined);

const useTint = (): string | undefined => useContext(TintContext);

export default useTint;
