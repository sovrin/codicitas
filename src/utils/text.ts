/**
 * Letter spaced capitals, "D O N E" - a terminal's only display face, so kept
 * for the few headings that are read rather than scanned.
 *
 * @param text
 */
export const spaced = (text: string): string => [...text.toUpperCase()].join(' ');

/**
 * The first line of a text, cut to so many characters with an ellipsis where
 * it had to be - for quoting an entry inside a line that has more to say.
 *
 * @param text
 * @param max
 */
export const quote = (text: string, max: number): string => {
    const [first = ''] = text.split('\n');
    const list = [...first];

    return list.length <= max
        ? first
        : `${list
              .slice(0, Math.max(1, max - 1))
              .join('')
              .trimEnd()}…`;
};

/**
 * Text the terminal opens a URL for when clicked, the way ls --hyperlink and
 * gcc do it (OSC 8). A terminal without it shows the text alone.
 *
 * @param url
 * @param text
 */
export const hyperlink = (url: string, text: string): string =>
    `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
