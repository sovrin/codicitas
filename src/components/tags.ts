import type {Priority, Tag} from '#/services/journal';

type Style = {
    glyph: string;
    /**
     * Hue only where a tag needs you: yellow waits on you, red is in your
     * way, green has settled. Everything else stays in graphite.
     */
    color?: string;
    dim?: boolean;
    /**
     * Something learned reads as a note in the margin.
     */
    italic?: boolean;
};

export const TAG_STYLE: Record<Tag, Style> = {
    note: {glyph: '•', dim: true},
    done: {glyph: '✓', color: 'green'},
    todo: {glyph: '○', color: 'yellow'},
    blocked: {glyph: '✗', color: 'red'},
    til: {glyph: '★', dim: true, italic: true},
    meet: {glyph: '◆', dim: true},
};

/**
 * A tag's style, with a low priority todo turned grey: it waits, but not on
 * you, not yet.
 *
 * @param tag
 * @param priority
 */
export const styleOf = (tag: Tag, priority?: Priority): Style =>
    tag === 'todo' && priority === 1
        ? {...TAG_STYLE.todo, color: undefined, dim: true}
        : TAG_STYLE[tag];
