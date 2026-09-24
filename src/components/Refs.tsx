import React, {useContext, useEffect} from 'react';
import {Text} from 'ink';
import {ModulesContext} from '#/hooks';
import {type Range, references} from '#/services/references';
import {hyperlink, underlined} from '#/utils';

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
 * they read as an aside to what was written; only a badge has a colour, the
 * one place something needs you. A reference to something finished with, like
 * a merged pull request, is faded too, and struck through once dropped.
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

    // a reference as a module knows it: a link, underlined in its badge's colour
    const draw = (reference: string): string => {
        const found = known.get(reference);
        const shown = found?.underline ? underlined(found.underline, reference) : reference;

        return found?.link ? hyperlink(found.link, shown) : shown;
    };

    return (
        <>
            {parts.map((part, at) => {
                const settled = part.isReference ? known.get(part.text)?.settled : undefined;

                return (
                    <Text
                        key={at}
                        underline={part.isReference}
                        dimColor={(part.isNote && !part.color) || settled !== undefined}
                        strikethrough={settled === 'dropped' || part.isStruck}
                        color={part.color}
                        bold={bold && !part.isNote}
                    >
                        {part.isReference ? draw(part.text) : part.text}
                    </Text>
                );
            })}
        </>
    );
};

export default Refs;
