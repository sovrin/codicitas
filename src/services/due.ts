import {type Entry, MID} from './journal';
import {daysBetween, fromKey, toKey, toShortLabel} from '#/utils';

const WEEKDAY = new Intl.DateTimeFormat('en-GB', {weekday: 'short'});

/**
 * How a due date stands: gone by, today, or still ahead.
 */
export type Urgency = 'late' | 'today' | 'ahead';

export type Due = {
    /**
     * "due fri", "due 12 Oct", "2d overdue".
     */
    label: string;
    urgency: Urgency;
};

/**
 * What an open todo's due date says today: the day by name within the week,
 * by date beyond it, and how long ago once it has passed. Only a todo still
 * open has one worth showing; a done one made it, or did not, either way.
 *
 * @param entry
 * @param today
 */
export const dueOf = (
    {tag, due}: Pick<Entry, 'tag' | 'due'>,
    today: string = toKey(),
): Due | undefined => {
    if (tag !== 'todo' || !due) {
        return undefined;
    }

    const days = daysBetween(today, due);

    if (days < 0) {
        return {label: `${-days}d overdue`, urgency: 'late'};
    }

    const when =
        days === 0
            ? 'today'
            : days === 1
              ? 'tomorrow'
              : days < 7
                ? WEEKDAY.format(fromKey(due)).toLowerCase()
                : toShortLabel(due);

    return {label: `due ${when}`, urgency: days === 0 ? 'today' : 'ahead'};
};

/**
 * What goes in front of an open todo's text for its due date, after its
 * priority's mark: "due fri · ".
 *
 * @param due
 */
export const leadOf = (due: Due | undefined): string => (due ? `${due.label} · ` : '');

/**
 * Whether a todo is due today or was before, and so comes before anything
 * that can still wait, however urgent.
 *
 * @param entry
 * @param today
 */
export const isPressing = ({tag, due}: Pick<Entry, 'tag' | 'due'>, today: string): boolean =>
    tag === 'todo' && due !== undefined && due <= today;

type Todo = Pick<Entry, 'tag' | 'due' | 'priority'>;

/**
 * Open todos in the order they want doing: what is due today or overdue
 * first, the longest overdue leading; then by priority, the ones with a date
 * before the ones without, the soonest first. Otherwise the order they came
 * in, which is the oldest first.
 *
 * @param todos
 * @param today
 */
export const backlog = <T extends Todo>(todos: T[], today: string = toKey()): T[] =>
    todos.toSorted((a, b) => {
        const pressing = Number(isPressing(b, today)) - Number(isPressing(a, today));

        if (pressing !== 0) {
            return pressing;
        }

        const byDate = (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99');
        const byPriority = (b.priority ?? MID) - (a.priority ?? MID);

        return isPressing(a, today) ? byDate || byPriority : byPriority || byDate;
    });
