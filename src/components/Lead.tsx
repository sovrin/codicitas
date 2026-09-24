import React from 'react';
import {Text} from 'ink';
import {DUE_STYLE} from './tags';
import {type Due, leadOf} from '#/services/due';
import type {Priority} from '#/services/journal';

type Props = {
    /**
     * The !! or ! of an urgent todo.
     */
    mark: string;
    due?: Due;
    priority?: Priority;
};

/**
 * What an open todo's text starts with: its priority's mark in yellow, then
 * its due date in the colour of how it stands.
 *
 * @param mark
 * @param due
 * @param priority
 * @constructor
 */
const Lead = ({mark, due, priority}: Props) => (
    <>
        {mark && (
            <Text color="yellow" bold={priority === 4}>
                {mark}
            </Text>
        )}
        {due && (
            <Text color={DUE_STYLE[due.urgency].color} dimColor={DUE_STYLE[due.urgency].dim}>
                {leadOf(due)}
            </Text>
        )}
    </>
);

export default Lead;
