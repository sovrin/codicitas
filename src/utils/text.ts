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

/**
 * Enough of a token to tell which one it is, not enough to use it.
 *
 * @param token
 */
export const masked = (token: string): string =>
    `${'•'.repeat(8)}${token.length > 12 ? token.slice(-4) : ''}`;

/**
 * The terminal's own colours, by the names ink uses for them.
 */
const PALETTE: Record<string, number> = {
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    gray: 8,
};

/**
 * Text whose underline is drawn in a colour of its own, leaving the text as
 * it is (SGR 58). A terminal without it draws the underline as usual. Written
 * with colons: ink reads the form with semicolons as separate codes, and
 * would make it blink.
 *
 * @param colour a name ink knows, like red
 * @param text
 */
export const underlined = (colour: string, text: string): string =>
    PALETTE[colour] === undefined ? text : `\u001b[58:5:${PALETTE[colour]}m${text}\u001b[59m`;
