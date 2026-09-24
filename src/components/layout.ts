import type {Clock} from '#/services/settings';
import {timeWidth} from '#/utils';

/**
 * Breathing room between the frame and the terminal's edge.
 */
export const PAD_X = 2;
export const PAD_Y = 1;

/**
 * The padding, two header rows, a blank row above the body and the status row
 * below it; the footer is whatever the view puts there.
 */
const CHROME = 2 * PAD_Y + 4;

/**
 * Rows left for the body once the frame and a footer of the given height are
 * drawn.
 *
 * @param rows
 * @param footer
 */
export const bodyRows = (rows: number, footer: number): number =>
    Math.max(1, rows - CHROME - footer);

/**
 * Columns inside the padding.
 *
 * @param columns
 */
export const contentWidth = (columns: number): number => Math.max(20, columns - 2 * PAD_X);

/**
 * Whether the terminal is too narrow for the week in three letters, and names
 * it in one instead.
 *
 * @param columns
 */
export const isNarrow = (columns: number): boolean => columns < 100;

/**
 * Selection bar and space, time, space, glyph on the rail, space. The time is
 * wider on a 12 hour clock, and the rail moves over with it.
 *
 * @param clock
 */
export const railWidth = (clock: Clock): number => 2 + timeWidth(clock) + 3;

/**
 * The column entries are written in, with one to spare so the cursor has
 * somewhere to sit at the end of a full row. Written and saved text wrap alike,
 * so an entry does not reflow the moment it is saved.
 *
 * @param columns
 * @param clock
 */
export const textWidth = (columns: number, clock: Clock = '24h'): number =>
    Math.max(10, contentWidth(columns) - railWidth(clock) - 1);
