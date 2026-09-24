/**
 * How a module's references are written, each a template: {ref} is the
 * reference itself, {title} its title, {mark} its badge's mark and {link}
 * where it opens.
 */
export type Templates = {
    /**
     * A reference with its title on screen, at its first mention.
     */
    title: string;
    /**
     * A reference with its badge's mark, in colour-blind mode.
     */
    mark: string;
    /**
     * A reference with its title in the standup you copy.
     */
    copy: string;
};

/**
 * How references are written unless a module says otherwise: the title in
 * brackets right after the reference, the mark after a space.
 */
export const TEMPLATES: Templates = {
    title: '{ref}[{title}]',
    mark: '{ref} {mark}',
    copy: '{ref}[{title}]',
};

/**
 * A placeholder, or a brace written twice to stand for itself.
 */
const PARTS = /\{\{|\}\}|\{(\w+)\}/g;

/**
 * A template with its placeholders filled in: legacy#12[Fix login] from
 * {ref}[{title}]. A placeholder without a value is left out; {{ and }} are
 * braces.
 *
 * @param template
 * @param values
 */
export const render = (template: string, values: Record<string, string | undefined>): string =>
    template.replace(PARTS, (part, name: string | undefined) =>
        part === '{{' ? '{' : part === '}}' ? '}' : (values[name] ?? ''),
    );

/**
 * The placeholders a template uses, each once.
 *
 * @param template
 */
export const placeholders = (template: string): string[] => [
    ...new Set([...template.matchAll(PARTS)].flatMap(([, name]) => (name ? [name] : []))),
];

/**
 * A template filled in around one placeholder that is drawn apart, like the
 * reference itself: what comes before it and what after. Without that
 * placeholder, everything comes after.
 *
 * @param template
 * @param name
 * @param values
 */
export const around = (
    template: string,
    name: string,
    values: Record<string, string | undefined>,
): [string, string] => {
    // a character no template has, to find the placeholder by
    const mark = '\u0000';
    const filled = render(template, {...values, [name]: mark});
    const at = filled.indexOf(mark);

    return at === -1
        ? ['', filled]
        : [filled.slice(0, at), filled.slice(at + 1).replaceAll(mark, '')];
};
