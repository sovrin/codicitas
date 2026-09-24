import React from 'react';
import {Box} from 'ink';

/**
 * A full width rule. Drawn as a box border so the terminal width is the
 * layout's problem, not ours - it also stays right after a resize.
 *
 * @constructor
 */
const Divider = () => (
    <Box
        width="100%"
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderDimColor
    />
);

export default Divider;
