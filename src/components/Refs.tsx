import React, {useContext, useEffect} from 'react';
import {Text} from 'ink';
import {ModulesContext} from '#/hooks';
import {type Range, references} from '#/services/references';
import {hyperlink} from '#/utils';

type Props = {
    text: string;
    /**
     * What was added for the reader, like a ticket's title, drawn faded, or a
     * badge, drawn in its colour.
     */
    notes?: Range[];
    bold?: boolean;
};

/**
 * Text with its #topics, tickets and @colleagues underlined, the way a
 * terminal shows a link - marked as something to follow, without a colour of
 * its own. A reference a module knows, like a ticket Jira has, is a link to it
 * as well, opened by clicking it in a terminal that can. Notes are faded, so
 * they read as an aside to what was written, unless a module gives one a
 * colour: then it is drawn in it, like a badge or a merged pull request's title.
 * A reference a module gives a colour is drawn in it too.
 *
 * @param text
 * @param notes
 * @param bold
 * @constructor
 */
const Refs = ({text, notes, bold}: Props) => {
    const {known, show} = useContext(ModulesContext);
    const parts = references(text, notes);
    // what this draws is on screen, so the modules may ask about it
    const drawn = parts
        .filter(({isReference}) => isReference)
        .map((part) => part.text)
        .join('\n');

    useEffect(() => (drawn ? show(drawn.split('\n')) : undefined), [show, drawn]);

    return (
        <>
            {parts.map((part, at) => (
                <Text
                    key={at}
                    underline={part.isReference}
                    dimColor={part.isNote && !part.color}
                    color={part.isReference ? known.get(part.text)?.color : part.color}
                    bold={bold && !part.isNote}
                >
                    {part.isReference && known.get(part.text)?.link
                        ? hyperlink(known.get(part.text).link, part.text)
                        : part.text}
                </Text>
            ))}
        </>
    );
};

export default Refs;
