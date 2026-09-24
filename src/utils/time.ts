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
