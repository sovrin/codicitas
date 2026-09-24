import {defaults, definitions, type ModuleSettings} from '#/modules';
import {type Definition, definer, isEntries} from './definition';
import {type Tag, TAGS} from './journal';

export type WeekStart = 'monday' | 'sunday';

export type Clock = '24h' | '12h';

type Core = {
    /**
     * Minutes from which a break between entries is drawn; 0 draws none.
     */
    gap: number;
    /**
     * Whether the time since the last entry is counted before now.
     */
    quiet: boolean;
    weekStart: WeekStart;
    /**
     * How times are shown. Typed times are read on either clock regardless.
     */
    clock: Clock;
    /**
     * The tag a new entry starts as, before any /tag.
     */
    tag: Tag;
    /**
     * Spaces a tab stands for.
     */
    indent: number;
    /**
     * Whether the idle key hints are shown. What a mode asks for - saving,
     * confirming a delete - is shown either way.
     */
    hints: boolean;
    /**
     * Whether what colour says is said with marks as well, like a module's
     * badge drawn as ✗ after a reference rather than as the colour of its
     * underline.
     */
    colourBlind: boolean;
};

/**
 * The settings of codicitas itself, and of each module.
 */
export type Settings = Core & ModuleSettings;

export const DEFAULTS: Settings = {
    gap: 30,
    quiet: true,
    weekStart: 'monday',
    clock: '24h',
    tag: 'note',
    indent: 2,
    hints: true,
    colourBlind: false,
    ...defaults(),
};

const define = definer<Settings>();

/**
 * The settings of codicitas itself, in the order they are listed. Most only
 * take the values listed with them, so they are changed by stepping through
 * them rather than typed - there is nothing to get wrong. Only what cannot be
 * listed, like a module's address or sign in, is typed.
 */
export const GENERAL: Definition<Settings>[] = [
    define({
        id: 'gap',
        label: 'Show breaks from',
        description: 'Stretches between entries shorter than this stay out of the timeline.',
        values: [15, 30, 45, 60, 0],
        format: (minutes) =>
            minutes === 0 ? 'never' : minutes === 60 ? '1 hour' : `${minutes} minutes`,
    }),
    define({
        id: 'quiet',
        label: 'Count quiet time',
        description: 'Shows how long it has been since your last entry, just above now.',
        values: [true, false],
        format: (on) => (on ? 'on' : 'off'),
    }),
    define({
        id: 'weekStart',
        label: 'Week starts on',
        description: 'The first day of the week strip in the header.',
        values: ['monday', 'sunday'],
        format: (day) => (day === 'monday' ? 'Monday' : 'Sunday'),
    }),
    define({
        id: 'clock',
        label: 'Clock',
        description: 'How times are shown. Either way you can type @22:30 or @10:30pm.',
        values: ['24h', '12h'],
        format: (clock) => (clock === '24h' ? '24-hour' : '12-hour'),
    }),
    define({
        id: 'tag',
        label: 'New entries start as',
        description:
            'The tag a new entry gets unless it starts with a /tag. Also used by codi add.',
        values: TAGS,
        format: (tag) => tag,
    }),
    define({
        id: 'indent',
        label: 'Tab width',
        description: 'How far tab indents and shift+tab outdents, and what a pasted tab becomes.',
        values: [2, 4],
        format: (spaces) => `${spaces} spaces`,
    }),
    define({
        id: 'hints',
        label: 'Key hints',
        description:
            'The keys along the bottom. Hide them once you know them; ? still lists every key.',
        values: [true, false],
        format: (on) => (on ? 'shown' : 'hidden'),
    }),
    define({
        id: 'colourBlind',
        label: 'Colour-blind mode',
        description:
            "Says with marks what is otherwise only a colour: a pull request's checks as ✓ ✗ ● after it, rather than the colour of its underline.",
        values: [false, true],
        format: (on) => (on ? 'on' : 'off'),
    }),
];

/**
 * Every setting, codicitas' own and each module's.
 */
export const SETTINGS: Definition<Settings>[] = [...GENERAL, ...definitions<Settings>()];

/**
 * Settings as stored, made whole: whatever is missing or no longer allowed
 * falls back to its default, so an older database gains new settings and a
 * dropped value cannot leave one in a state the screen cannot show.
 *
 * @param stored
 */
export const normalize = (stored: Record<string, unknown> = {}): Settings => {
    const settings: Record<string, unknown> = {...DEFAULTS};

    for (const {id, values, entries} of SETTINGS) {
        const value = stored[id];

        if (
            entries
                ? isEntries(value)
                : values
                  ? (values as unknown[]).includes(value)
                  : typeof value === 'string'
        ) {
            settings[id] = value;
        }
    }

    return settings as Settings;
};

/**
 * The next allowed value of a setting, wrapping at either end. A typed
 * setting has none, and stays as it is.
 *
 * @param settings
 * @param id
 * @param delta
 */
export const step = (settings: Settings, id: keyof Settings, delta: number): Settings => {
    const {values} = SETTINGS.find((definition) => definition.id === id);

    if (!values) {
        return settings;
    }

    const at = (values as unknown[]).indexOf(settings[id]);
    const next = values[(((at + delta) % values.length) + values.length) % values.length];

    return {...settings, [id]: next};
};
