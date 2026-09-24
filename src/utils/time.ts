const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * A local calendar day as YYYY-MM-DD, which is also the journal's file name.
 * Built from the local parts on purpose: toISOString would hand back yesterday
 * for anyone east of Greenwich shortly after midnight.
 *
 * @param date
 */
export const toKey = (date: Date = new Date()): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 *
 * @param key
 */
export const fromKey = (key: string): Date => {
    const [year, month, day] = key.split('-').map(Number);

    return new Date(year, month - 1, day);
};

/**
 *
 * @param date
 */
export const toClock = (date: Date = new Date()): string =>
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const HEADLINE = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});

/**
 * A day as a heading: "Thursday 24 September". The year only appears once it
 * is not this one, where it stops going without saying.
 *
 * @param key
 * @param today
 */
export const toHeadline = (key: string, today: string = toKey()): string => {
    // assembled from parts: the formatter puts a comma after the weekday once
    // a year is asked for, and the heading should read the same either way
    const parts = Object.fromEntries(
        HEADLINE.formatToParts(fromKey(key)).map(({type, value}) => [type, value]),
    );
    const words = [parts.weekday, parts.day, parts.month];

    return (key.slice(0, 4) === today.slice(0, 4) ? words : [...words, parts.year]).join(' ');
};

const SHORT = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short'});

/**
 * A day in passing: "10 Sept".
 *
 * @param key
 */
export const toShortLabel = (key: string): string => SHORT.format(fromKey(key));

/**
 * The week a day falls in, Monday to Sunday or Sunday to Saturday.
 *
 * @param key
 * @param start
 */
export const weekOf = (key: string, start: 'monday' | 'sunday' = 'monday'): string[] => {
    const date = fromKey(key);
    const back = start === 'monday' ? (date.getDay() + 6) % 7 : date.getDay();
    const first = new Date(date.getFullYear(), date.getMonth(), date.getDate() - back);

    return Array.from({length: 7}, (_, offset) =>
        toKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset)),
    );
};

/**
 * The calendar day so many days away.
 *
 * @param key
 * @param delta
 */
export const shiftDay = (key: string, delta: number): string => {
    const date = fromKey(key);

    return toKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
};

/**
 * How wide a time is on the given clock: "09:05" or " 9:05am".
 *
 * @param clock
 */
export const timeWidth = (clock: '24h' | '12h'): number => (clock === '24h' ? 5 : 7);

/**
 * A stored HH:MM time as the clock shows it, padded so a column of times lines
 * up: "22:30" or "10:30pm", " 9:05am".
 *
 * @param time
 * @param clock
 */
export const formatTime = (time: string, clock: '24h' | '12h'): string => {
    if (clock === '24h') {
        return time;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const suffix = hours < 12 ? 'am' : 'pm';

    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}${suffix}`.padStart(
        timeWidth(clock),
    );
};

/**
 * Minutes since midnight of an HH:MM time.
 *
 * @param time
 */
export const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
};

/**
 * A stretch of time as it is said: "47m", "1h 35m", "3h".
 *
 * @param minutes
 */
export const toDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    if (hours === 0) {
        return `${rest}m`;
    }

    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/**
 * In the order Date counts them, Sunday first.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MONTHS = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
];

/**
 * The name a word stands for: the name itself, or the start of exactly one,
 * so >f is Friday while >t stays text, being today, tomorrow, Tuesday or
 * Thursday.
 *
 * @param word
 * @param names
 */
const unique = (word: string, names: string[]): string | undefined => {
    if (names.includes(word)) {
        return word;
    }

    const matches = names.filter((name) => name.startsWith(word));

    return matches.length === 1 ? matches[0] : undefined;
};

/**
 * Days from one day to another, negative when it lies behind. Rounded, since
 * a day that changes the clock is an hour short or long.
 *
 * @param from
 * @param to
 */
export const daysBetween = (from: string, to: string): number =>
    Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 86_400_000);

/**
 * A calendar day, when there is one: 31 February is not.
 *
 * @param year
 * @param month 0 for January
 * @param day
 */
const dayOf = (year: number, month: number, day: number): string | undefined => {
    const date = new Date(year, month, day);

    return date.getMonth() === month && date.getDate() === day ? toKey(date) : undefined;
};

/**
 * A day and a month, in whichever year comes next: 2 October this year while
 * it is still ahead, next year once it has passed.
 *
 * @param day
 * @param month the name as typed, three letters at least
 * @param today
 */
const nextDate = (day: number, month: string, today: string): string | undefined => {
    const name = month.length >= 3 ? unique(month, MONTHS) : undefined;

    if (!name) {
        return undefined;
    }

    const year = fromKey(today).getFullYear();
    const index = MONTHS.indexOf(name);

    // the first year that has the day still ahead; 29 February can take a few
    for (let ahead = 0; ahead <= 8; ahead++) {
        const date = dayOf(year + ahead, index, day);

        if (date && date >= today) {
            return date;
        }
    }

    return undefined;
};

/**
 * The day a word after > names, counted from today: >fri is the coming
 * Friday, a week ahead on a Friday, since today has a name of its own; >tom
 * tomorrow; >3d and >2w in three days and two
 * weeks; >2oct and >oct2 the next 2 October; >2026-10-02 that very day.
 * Anything else names no day.
 *
 * @param word
 * @param today
 */
export const resolveDue = (word: string, today: string = toKey()): string | undefined => {
    const lower = word.toLowerCase();

    const relative = /^(\d{1,3})([dw])$/.exec(lower);

    if (relative) {
        return shiftDay(today, Number(relative[1]) * (relative[2] === 'w' ? 7 : 1));
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lower);

    if (iso) {
        return dayOf(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    const dayFirst = /^(\d{1,2})([a-z]+)$/.exec(lower);
    const monthFirst = /^([a-z]+)(\d{1,2})$/.exec(lower);

    if (dayFirst) {
        return nextDate(Number(dayFirst[1]), dayFirst[2], today);
    }

    if (monthFirst) {
        return nextDate(Number(monthFirst[2]), monthFirst[1], today);
    }

    const name = /^[a-z]+$/.test(lower)
        ? unique(lower, ['today', 'tomorrow', ...WEEKDAYS])
        : undefined;

    if (name === 'today') {
        return today;
    }

    if (name === 'tomorrow') {
        return shiftDay(today, 1);
    }

    if (name) {
        return shiftDay(today, (WEEKDAYS.indexOf(name) - fromKey(today).getDay() + 7) % 7 || 7);
    }

    return undefined;
};
