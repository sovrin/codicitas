import React, {type ReactNode} from 'react';
import {Box, Text} from 'ink';
import {PAD_X, PAD_Y} from './layout';
import {useSize} from '#/hooks';

type Props = {
    title: ReactNode;
    subtitle?: ReactNode;
    aside?: ReactNode;
    subaside?: ReactNode;
    /**
     * What the view is asking or saying, in the row above the keys.
     */
    status?: ReactNode;
    footer: ReactNode;
    children: ReactNode;
};

/**
 * The frame every view is drawn in: two header rows, the body, a status row
 * and the keys. No rules between them - whitespace separates, so the only
 * lines on screen are the ones that mean something. The status row is blank
 * until there is something to say, so nothing moves when there is.
 *
 * @param title
 * @param subtitle
 * @param aside
 * @param subaside
 * @param status
 * @param footer
 * @param children
 * @constructor
 */
const Frame = ({title, subtitle, aside, subaside, status, footer, children}: Props) => {
    const {rows} = useSize();

    return (
        <Box flexDirection="column" height={rows} paddingX={PAD_X} paddingY={PAD_Y}>
            <Box justifyContent="space-between">
                <Text wrap="truncate-end">{title}</Text>
                <Text>{aside}</Text>
            </Box>
            <Box justifyContent="space-between">
                <Text wrap="truncate-end">{subtitle ?? ' '}</Text>
                <Text>{subaside}</Text>
            </Box>

            <Box flexDirection="column" flexGrow={1} overflow="hidden" marginTop={1}>
                {children}
            </Box>

            <Box height={1} overflow="hidden">
                {status ?? <Text> </Text>}
            </Box>
            {footer}
        </Box>
    );
};

export default Frame;
