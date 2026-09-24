import React, {useContext} from 'react';
import {Text} from 'ink';
import {TicketsContext} from '#/hooks';
import {isTicket, type Range, references} from '#/services/references';
import {hyperlink} from '#/utils';

type Props = {
    text: string;
    /**
     * What was added for the reader, like a ticket's title, drawn faded.
     */
    notes?: Range[];
    bold?: boolean;
};

/**
 * Text with its #topics, tickets and @colleagues underlined, the way a
 * terminal shows a link - marked as something to follow, without a colour of
 * its own. A ticket Jira knows is a link to it as well, opened by clicking it
 * in a terminal that can. Notes are faded, so they read as an aside to what
 * was written.
 *
 * @param text
 * @param notes
 * @param bold
 * @constructor
 */
const Refs = ({text, notes, bold}: Props) => {
    const {site, titles} = useContext(TicketsContext);

    return (
        <>
            {references(text, notes).map((part, at) => (
                <Text
                    key={at}
                    underline={part.isReference}
                    dimColor={part.isNote}
                    bold={bold && !part.isNote}
                >
                    {site && part.isReference && isTicket(part.text) && titles.has(part.text)
                        ? hyperlink(`${site}/browse/${part.text}`, part.text)
                        : part.text}
                </Text>
            ))}
        </>
    );
};

export default Refs;
