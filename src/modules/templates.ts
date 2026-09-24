import type {Definition} from '#/services/definition';
import {render, TEMPLATES, type Templates} from '#/services/template';

/**
 * What each template is for, and which placeholders it knows.
 */
const ABOUT: Record<keyof Templates, {label: string; description: string}> = {
    title: {
        label: 'Title',
        description:
            'How a title is written at its first mention: {ref} for the reference, {title} for its title.',
    },
    mark: {
        label: 'Mark',
        description:
            'How the mark is written in colour-blind mode: {ref} for the reference, {mark} for ✓ ✗ ●.',
    },
    copy: {
        label: 'Copied',
        description:
            'How a reference is written in the standup you copy: {ref}, {title}, {link} and {mark}. [{ref}]({link}) {title} makes Markdown links.',
    },
};

/**
 * A module's template setting: typed, its default shown while it is empty,
 * and what it looks like shown with an example of the module's.
 *
 * @param name which template
 * @param id the setting
 * @param example a reference of the module's, filled in the way it would be
 * @param fallback the module's own default, the general one when missing
 */
export const template = <S>(
    name: keyof Templates,
    id: keyof S & string,
    example: Record<string, string>,
    fallback = TEMPLATES[name],
): Definition<S> =>
    ({
        id,
        ...ABOUT[name],
        description: `${ABOUT[name].description} Empty for the default.`,
        fallback,
        group: 'templates',
        display: true,
        format: (value: unknown) => (typeof value === 'string' && value.trim() ? value : fallback),
        preview: (value: unknown) =>
            render(typeof value === 'string' && value.trim() ? value.trim() : fallback, example),
    }) as unknown as Definition<S>;
