import React, {useContext, useEffect} from 'react';
import {Text} from 'ink';
import {ModulesContext, useTint} from '#/hooks';
import {type Range, references} from '#/services/references';
import {hyperlink, underlined} from '#/utils';

/**
 * What code is drawn in, the way an editor shows it. Red, yellow and green
 * say how things stand; this says nothing but code.
 */
const CODE_COLOUR = 'cyan';

type Props = {
    text: string;
    /**
     * What was added for the reader, like a ticket's title, drawn faded, or a
     * badge, drawn in its colour; and where the code is.
     */
    ranges?: Range[];
    bold?: boolean;
};

/**
 * Text with its #topics, tickets and @colleagues underlined, the way a
 * terminal shows a link - marked as something to follow, without a colour of
 * its own. A reference a module knows, like a ticket Jira has, is a link to it
 * as well, opened by clicking it in a terminal that can. Notes are faded, so
 * they read as an aside to what was written; only a badge has a colour, the
 * one place something needs you. A reference to something finished with, like
 * a merged pull request, is faded too, and struck through once dropped. Code
 * is taken as written and drawn in a colour of its own, on a shade just off
 * the terminal's background where it said what that is, with its backticks as
 * the room around it; otherwise, and on the lines around a block, the
 * backticks are faded.
 *
 * @param text
 * @param ranges
 * @param bold
 * @constructor
 */
const Refs = ({text, ranges, bold}: Props) => {
    const {known, show} = useContext(ModulesContext);
    const parts = references(text, ranges);
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

    const background = useTint();
    // backticks with nothing but space beside them, like ``` around a block
    const alone = parts.every((part) => part.code === 'fence' || !part.text.trim());

    return (
        <>
            {parts.map((part, at) => {
                const settled = part.isReference ? known.get(part.text)?.settled : undefined;

                if (part.code === 'text' || (part.code && background && !alone)) {
                    return (
                        <Text key={at} color={CODE_COLOUR} backgroundColor={background} bold={bold}>
                            {part.code === 'fence' ? ' '.repeat(part.text.length) : part.text}
                        </Text>
                    );
                }

                return (
                    <Text
                        key={at}
                        underline={part.isReference}
                        dimColor={
                            (part.isNote && !part.color) ||
                            settled !== undefined ||
                            part.code === 'fence'
                        }
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
