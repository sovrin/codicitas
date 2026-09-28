/**
 * Asks the terminal what colour its background is (OSC 11), and right after
 * it for its attributes (DA1), which every terminal answers. An answer to the
 * second without one to the first means the terminal doesn't say, so there is
 * nothing left to wait for, and no answer arrives late to be read as keys.
 */
const ASK = '\x1b]11;?\x1b\\\x1b[c';

/**
 * How long a terminal gets to answer at all, for one that answers neither.
 */
const PATIENCE = 500;

/**
 * How far code's background is from the terminal's: toward white on a dark
 * one, toward black on a light one, enough to see and no more.
 */
const LIGHTER = 0.08;
const DARKER = 0.06;

type Rgb = [number, number, number];

let background: string | undefined;

/**
 * The background colour in a terminal's answer, rgb:RRRR/GGGG/BBBB with one
 * to four hex digits a channel, each from 0 to 1.
 *
 * @param answer
 */
export const parse = (answer: string): Rgb | undefined => {
    const match = /\]11;rgb:([\da-f]{1,4})\/([\da-f]{1,4})\/([\da-f]{1,4})/i.exec(answer);

    if (!match) {
        return undefined;
    }

    const [, ...channels] = match;

    return channels.map((hex) => Number.parseInt(hex, 16) / (16 ** hex.length - 1)) as Rgb;
};

/**
 * A shade just off a background, as #rrggbb: lighter on a dark one, darker on
 * a light one.
 *
 * @param rgb
 */
export const tint = ([red, green, blue]: Rgb): string => {
    const isDark = 0.2126 * red + 0.7152 * green + 0.0722 * blue < 0.5;
    const shade = (channel: number) =>
        isDark ? channel + (1 - channel) * LIGHTER : channel * (1 - DARKER);

    return `#${[red, green, blue]
        .map((channel) =>
            Math.round(shade(channel) * 255)
                .toString(16)
                .padStart(2, '0'),
        )
        .join('')}`;
};

/**
 * The six levels of each channel in the 256 colours' cube, from 16 on.
 */
const CUBE = [0, 95, 135, 175, 215, 255];

/**
 * The closest of the 256 colours to a #rrggbb: from the cube, or from the
 * greys after it, 8 to 238 in steps of 10, which are finer than the cube's
 * and where a shade off a dark or light background usually falls. Rounding
 * each channel to the cube, as chalk does, makes a faint shade a loud one.
 *
 * @param hex
 */
export const nearest = (hex: string): number => {
    const rgb = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
    const distance = (other: number[]) =>
        other.reduce((sum, channel, at) => sum + (channel - rgb[at]) ** 2, 0);
    const candidates: [number, number[]][] = [
        ...CUBE.flatMap((red, r) =>
            CUBE.flatMap((green, g) =>
                CUBE.map((blue, b): [number, number[]] => [
                    16 + 36 * r + 6 * g + b,
                    [red, green, blue],
                ]),
            ),
        ),
        ...Array.from({length: 24}, (_, at): [number, number[]] => [
            232 + at,
            Array(3).fill(8 + 10 * at),
        ]),
    ];

    return candidates.reduce((best, candidate) =>
        distance(candidate[1]) < distance(best[1]) ? candidate : best,
    )[0];
};

/**
 * Asks the terminal for its background, once, before anything is drawn and
 * with stdin in raw mode, so the answer is neither echoed nor read as keys.
 * Where it doesn't say, or has only its sixteen colours, code has no
 * background of its own; with 256, it gets the closest of them.
 *
 * @param level how many colours the terminal draws, as chalk counts: 2 for
 * 256, 3 for any
 */
export const ask = async (level: number): Promise<void> => {
    const {stdin, stdout} = process;

    if (level < 2 || !stdin.isTTY || !stdout.isTTY) {
        return;
    }

    let answer = '';

    await new Promise<void>((resolve) => {
        const done = () => {
            clearTimeout(timer);
            stdin.off('data', read);
            stdin.pause();
            resolve();
        };
        const read = (chunk: Buffer) => {
            answer += chunk.toString('latin1');

            // the attributes come last, as ESC [ ? … c
            if (/\[\?[\d;]*c/.test(answer)) {
                done();
            }
        };
        const timer = setTimeout(done, PATIENCE);

        stdin.on('data', read);
        stdout.write(ASK);
    });

    const rgb = parse(answer);

    const shade = rgb ? tint(rgb) : undefined;

    background = shade && level < 3 ? `ansi256(${nearest(shade)})` : shade;
};

/**
 * What code is drawn on, when the terminal said what its background is.
 */
export const codeBackground = (): string | undefined => background;
