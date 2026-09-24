import {type Tag, TAGS} from './journal';

export type WeekStart = 'monday' | 'sunday';

export type Clock = '24h' | '12h';

export type Settings = {
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
     * The Jira tickets are looked up in; empty leaves them as written.
     */
    jiraSite: string;
    /**
     * The account a Jira Cloud API token belongs to. Empty on Jira Server and
     * Data Center, where a personal access token is enough.
     */
    jiraEmail: string;
    jiraToken: string;
};

export const DEFAULTS: Settings = {
    gap: 30,
    quiet: true,
    weekStart: 'monday',
    clock: '24h',
    tag: 'note',
    indent: 2,
    hints: true,
    jiraSite: '',
    jiraEmail: '',
    jiraToken: '',
};

type Definition<K extends keyof Settings = keyof Settings> = {
    id: K;
    label: string;
    /**
     * What the setting changes, shown while it is selected.
     */
    description: string;
    /**
     * The values it steps through. A setting without them is typed instead,
     * for what cannot be listed - an address, a token.
     */
    values?: Settings[K][];
    format: (value: Settings[K]) => string;
    /**
     * A heading this setting starts, for the ones that belong together.
     */
    section?: string;
};

/**
 * Enough of a token to tell which one it is, not enough to use it.
 *
 * @param token
 */
export const masked = (token: string): string =>
    `${'•'.repeat(8)}${token.length > 12 ? token.slice(-4) : ''}`;

const define = <K extends keyof Settings>(definition: Definition<K>): Definition =>
    definition as unknown as Definition;

/**
 * Every setting, in the order they are listed. Most only take the values
 * listed with them, so they are changed by stepping through them rather than
 * typed - there is nothing to get wrong. Only what cannot be listed, Jira's
 * address and sign in, is typed.
 */
export const SETTINGS: Definition[] = [
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
        id: 'jiraSite',
        label: 'Site',
        section: 'jira',
        description:
            'Your Jira, like acme.atlassian.net. Tickets like PROJ-123 then show their title after them.',
        format: (site) => site || 'not set',
    }),
    define({
        id: 'jiraEmail',
        label: 'Email',
        description:
            'Who the API token belongs to, on Jira Cloud. Leave it empty on Jira Server or Data Center, where a personal access token is enough.',
        format: (email) => email || 'not set',
    }),
    define({
        id: 'jiraToken',
        label: 'Token',
        description:
            'An API token from id.atlassian.com, or a personal access token. Kept in the journal; leave it empty to use JIRA_API_TOKEN instead.',
        format: (token) => (token ? masked(token) : 'not set'),
    }),
];

/**
 * Settings as stored, made whole: whatever is missing or no longer allowed
 * falls back to its default, so an older database gains new settings and a
 * dropped value cannot leave one in a state the screen cannot show.
 *
 * @param stored
 */
export const normalize = (stored: Record<string, unknown> = {}): Settings => {
    const settings: Record<string, unknown> = {...DEFAULTS};

    for (const {id, values} of SETTINGS) {
        if (values ? (values as unknown[]).includes(stored[id]) : typeof stored[id] === 'string') {
            settings[id] = stored[id];
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
