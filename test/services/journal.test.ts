import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    count,
    type Entry,
    extractTag,
    findPriority,
    findTag,
    initial,
    listDays,
    markOf,
    prepare,
    rank,
    reducer,
    splitPrefixes,
    splitPriority,
    splitTime,
    type State,
    stepDay,
    toggle,
} from '#/services/journal';

const ENTRIES: Entry[] = [
    {id: 1, time: '09:14', tag: 'todo', text: 'review the auth PR'},
    {
        id: 2,
        time: '10:02',
        tag: 'done',
        text: 'fixed the flaky login test\nroot cause was a shared mock',
    },
    {id: 3, time: '11:30', tag: 'blocked', text: 'waiting on staging creds'},
];

const opened = reducer(initial('2026-09-24'), {
    type: 'open',
    day: '2026-09-24',
    entries: ENTRIES,
    days: ['2026-09-24'],
});

const tag = (state: State) => state.mode.kind === 'compose' && state.mode.tag;
const target = (state: State) => state.mode.kind === 'move' && state.mode.target;

describe('reducer', () => {
    it('selects the newest entry when a day opens', () => {
        assert.equal(opened.index, 2);
    });

    it('keeps the selection inside the list', () => {
        assert.equal(reducer(opened, {type: 'move', delta: 10}).index, 2);
        assert.equal(reducer(opened, {type: 'move', delta: -10}).index, 0);
    });

    it('opens an empty prompt for a new entry', () => {
        const {mode} = reducer(opened, {type: 'compose.open'});

        assert.deepEqual(mode, {
            kind: 'compose',
            draft: {buffer: '', cursor: 0},
            tag: 'note',
            pick: 0,
        });
    });

    it('prefills the prompt when editing', () => {
        const {mode} = reducer(opened, {type: 'compose.open', index: 0});

        assert.deepEqual(mode, {
            kind: 'compose',
            draft: {buffer: 'review the auth PR', cursor: 18},
            tag: 'todo',
            index: 0,
            pick: 0,
        });
    });

    it('cycles tags in both directions, wrapping around', () => {
        const composing = reducer(opened, {type: 'compose.open'});
        const back = reducer(composing, {type: 'compose.tag', delta: -1});

        assert.equal(tag(back), 'meet');
        assert.equal(tag(reducer(back, {type: 'compose.tag', delta: 1})), 'note');
    });

    it('does not ask to delete from an empty day', () => {
        const empty = initial('2026-09-24');

        assert.equal(reducer(empty, {type: 'confirm.open'}), empty);
    });

    it('clamps the selection once entries are removed', () => {
        const next = reducer(opened, {
            type: 'entries',
            entries: ENTRIES.slice(0, 1),
            days: ['2026-09-24'],
        });

        assert.equal(next.index, 0);
        assert.equal(next.mode.kind, 'normal');
    });
});

describe('views', () => {
    it('switches view, dropping whatever mode and notice there were', () => {
        const composing = reducer({...opened, notice: 'copied'}, {type: 'compose.open'});
        const next = reducer(composing, {type: 'view', view: 'standup'});

        assert.equal(next.view, 'standup');
        assert.equal(next.mode.kind, 'normal');
        assert.equal(next.notice, undefined);
    });

    it('opens a day in the journal, on the entry asked for', () => {
        const searching = reducer(opened, {type: 'view', view: 'search'});
        const next = reducer(searching, {
            type: 'open',
            day: '2026-09-20',
            entries: ENTRIES,
            days: [],
            index: 0,
        });

        assert.equal(next.view, 'journal');
        assert.equal(next.index, 0);
    });

    it('starts at the first result whenever the query changes', () => {
        const moved = reducer(opened, {type: 'found', delta: 5, total: 3});

        assert.equal(moved.found, 2);
        assert.equal(reducer(moved, {type: 'query', draft: {buffer: 'x', cursor: 1}}).found, 0);
    });
});

describe('listDays', () => {
    it('always offers today, newest first, without duplicates', () => {
        assert.deepEqual(listDays(['2026-09-20', '2026-09-24', '2026-09-22'], '2026-09-24'), [
            '2026-09-24',
            '2026-09-22',
            '2026-09-20',
        ]);
        assert.deepEqual(listDays([], '2026-09-24'), ['2026-09-24']);
    });
});

describe('stepDay', () => {
    const days = ['2026-09-24', '2026-09-22', '2026-09-20'];

    it('goes back in time on a positive step', () => {
        assert.equal(stepDay(days, '2026-09-24', 1), '2026-09-22');
        assert.equal(stepDay(days, '2026-09-22', -1), '2026-09-24');
    });

    it('stops at either end', () => {
        assert.equal(stepDay(days, '2026-09-20', 1), '2026-09-20');
        assert.equal(stepDay(days, '2026-09-24', -1), '2026-09-24');
    });
});

describe('toggle', () => {
    it('ticks a todo off and back', () => {
        assert.equal(toggle(ENTRIES[0]).tag, 'done');
        assert.equal(toggle(toggle(ENTRIES[0])).tag, 'todo');
    });

    it('leaves other tags alone', () => {
        assert.equal(toggle(ENTRIES[2]), ENTRIES[2]);
    });
});

describe('count', () => {
    it('counts entries per tag', () => {
        assert.deepEqual(count(ENTRIES), {todo: 1, done: 1, blocked: 1});
    });
});

describe('findTag', () => {
    it('takes a tag by name, in any case', () => {
        assert.equal(findTag('todo'), 'todo');
        assert.equal(findTag('TIL'), 'til');
    });

    it('takes the start of exactly one tag', () => {
        assert.equal(findTag('d'), 'done');
        assert.equal(findTag('bl'), 'blocked');
        assert.equal(findTag('to'), 'todo');
    });

    it('refuses an ambiguous or unknown word', () => {
        assert.equal(findTag('t'), undefined);
        assert.equal(findTag('etc'), undefined);
    });
});

describe('extractTag', () => {
    it('reads the tag off the start and drops it from the text', () => {
        assert.deepEqual(extractTag('/todo call the bank', 'note'), {
            tag: 'todo',
            text: 'call the bank',
        });
    });

    it('works across a line break', () => {
        assert.deepEqual(extractTag('/b\nwaiting on ops', 'note'), {
            tag: 'blocked',
            text: 'waiting on ops',
        });
    });

    it('leaves text that does not start with a tag alone', () => {
        assert.deepEqual(extractTag('/etc/hosts was wrong', 'note'), {
            tag: 'note',
            text: '/etc/hosts was wrong',
        });
        assert.deepEqual(extractTag('/t is ambiguous', 'meet'), {
            tag: 'meet',
            text: '/t is ambiguous',
        });
        assert.deepEqual(extractTag('fix /todo later', 'note'), {
            tag: 'note',
            text: 'fix /todo later',
        });
    });
});

describe('prepare', () => {
    it('reads the tag off and keeps the first line indented', () => {
        assert.deepEqual(prepare('\n\n/d shipped\n', 'note'), {tag: 'done', text: 'shipped'});
        assert.deepEqual(prepare('\n  indented\n  more\n\n', 'note'), {
            tag: 'note',
            text: '  indented\n  more',
        });
    });

    it('gives nothing for text that is only a tag or blank', () => {
        assert.equal(prepare('/todo', 'note'), undefined);
        assert.equal(prepare(' \n \n', 'note'), undefined);
    });
});

describe('splitTime', () => {
    it('reads an @time at the start, in any of its shapes', () => {
        assert.deepEqual(splitTime('@10:30 fixed it'), {time: '10:30', text: 'fixed it'});
        assert.deepEqual(splitTime('@9:05 standup'), {time: '09:05', text: 'standup'});
        assert.deepEqual(splitTime('@1745 wrap up'), {time: '17:45', text: 'wrap up'});
    });

    it('reads a 12 hour time too, with or without minutes', () => {
        assert.deepEqual(splitTime('@10:30pm deploy'), {time: '22:30', text: 'deploy'});
        assert.deepEqual(splitTime('@9:05am standup'), {time: '09:05', text: 'standup'});
        assert.deepEqual(splitTime('@10pm wrap up'), {time: '22:00', text: 'wrap up'});
        assert.deepEqual(splitTime('@930p call'), {time: '21:30', text: 'call'});
        assert.deepEqual(splitTime('@10:30PM loud'), {time: '22:30', text: 'loud'});
    });

    it('knows midnight and noon', () => {
        assert.equal(splitTime('@12:15am x').time, '00:15');
        assert.equal(splitTime('@12pm x').time, '12:00');
        assert.equal(splitTime('@12am x').time, '00:00');
    });

    it('lets pm agree with a 24 hour time, but not am', () => {
        assert.equal(splitTime('@22:30pm x').time, '22:30');
        assert.deepEqual(splitTime('@22:30am x'), {text: '@22:30am x'});
        assert.deepEqual(splitTime('@13am x'), {text: '@13am x'});
        assert.deepEqual(splitTime('@0pm x'), {text: '@0pm x'});
    });

    it('does not take a bare hour, or a word after the time, for a time', () => {
        assert.deepEqual(splitTime('@10 things'), {text: '@10 things'});
        assert.deepEqual(splitTime('@10:30 pm review'), {time: '10:30', text: 'pm review'});
        assert.deepEqual(splitTime('@10:30pmx no'), {text: '@10:30pmx no'});
    });

    it('leaves what is not a time as text', () => {
        assert.deepEqual(splitTime('@25:00 nope'), {text: '@25:00 nope'});
        assert.deepEqual(splitTime('@ops ping'), {text: '@ops ping'});
        assert.deepEqual(splitTime('meet @10:30'), {text: 'meet @10:30'});
    });
});

describe('splitPrefixes', () => {
    it('takes a tag and a time in either order', () => {
        assert.deepEqual(splitPrefixes('/done @10:30 fixed it'), {
            tag: 'done',
            time: '10:30',
            text: 'fixed it',
        });
        assert.deepEqual(splitPrefixes('@10:30 /done fixed it'), {
            tag: 'done',
            time: '10:30',
            text: 'fixed it',
        });
    });

    it('keeps a colleague at the start as text, telling it from a time', () => {
        assert.deepEqual(splitPrefixes('@anna paired on #auth'), {
            tag: undefined,
            time: undefined,
            text: '@anna paired on #auth',
        });
        assert.deepEqual(splitPrefixes('@10:30 @anna paired'), {
            tag: undefined,
            time: '10:30',
            text: '@anna paired',
        });
    });

    it('takes each once', () => {
        assert.deepEqual(splitPrefixes('/done /todo x'), {
            tag: 'done',
            time: undefined,
            text: '/todo x',
        });
    });

    it('carries the time through prepare', () => {
        assert.deepEqual(prepare('@9:30 /todo ask ops', 'note'), {
            tag: 'todo',
            text: 'ask ops',
            time: '09:30',
        });
        assert.equal(prepare('@9:30', 'note'), undefined);
    });
});

describe('moving', () => {
    it('offers the day before, never past today, and today on t', () => {
        const moving = reducer(opened, {type: 'move.open'});

        assert.deepEqual(moving.mode, {kind: 'move', index: 2, target: '2026-09-23'});
        assert.equal(
            target(
                reducer(reducer(moving, {type: 'move.step', delta: 1}), {
                    type: 'move.step',
                    delta: 1,
                }),
            ),
            '2026-09-24',
        );
        assert.equal(target(reducer(moving, {type: 'move.step', delta: -7})), '2026-09-16');
        assert.equal(
            target(reducer(reducer(moving, {type: 'move.step', delta: -7}), {type: 'move.today'})),
            '2026-09-24',
        );
    });
});

describe('today', () => {
    it('moves on without leaving the day on screen', () => {
        const next = reducer(opened, {
            type: 'today',
            today: '2026-09-25',
            days: ['2026-09-25', '2026-09-24'],
        });

        assert.equal(next.today, '2026-09-25');
        assert.equal(next.day, '2026-09-24');
    });
});

describe('priority', () => {
    it('names a priority by any unambiguous start', () => {
        assert.equal(findPriority('critical'), 4);
        assert.equal(findPriority('c'), 4);
        assert.equal(findPriority('H'), 3);
        assert.equal(findPriority('m'), 2);
        assert.equal(findPriority('low'), 1);
        assert.equal(findPriority('urgent'), undefined);
    });

    it('reads a !priority at the start only', () => {
        assert.deepEqual(splitPriority('!h review'), {priority: 3, text: 'review'});
        assert.deepEqual(splitPriority('wow! nice'), {text: 'wow! nice'});
        assert.deepEqual(splitPriority('!important note'), {text: '!important note'});
    });

    it('combines with a tag and a time, in any order', () => {
        assert.deepEqual(splitPrefixes('!c /todo @9:30 hotfix'), {
            tag: 'todo',
            time: '09:30',
            priority: 4,
            text: 'hotfix',
        });
        assert.deepEqual(prepare('/todo !l someday', 'note'), {
            tag: 'todo',
            text: 'someday',
            priority: 1,
        });
        assert.deepEqual(prepare('/todo plain', 'note'), {tag: 'todo', text: 'plain'});
    });

    it('steps up and down, stopping at either end, mid when unset', () => {
        const todo: Entry = {id: 1, time: '09:00', tag: 'todo', text: 'x'};

        assert.equal(rank(todo, 1), 3);
        assert.equal(rank(todo, -1), 1);
        assert.equal(rank({...todo, priority: 4}, 1), 4);
        assert.equal(rank({...todo, priority: 1}, -1), 1);
    });

    it('marks urgent open todos only', () => {
        assert.equal(markOf({tag: 'todo', priority: 4}), '!! ');
        assert.equal(markOf({tag: 'todo', priority: 3}), '! ');
        assert.equal(markOf({tag: 'todo'}), '');
        assert.equal(markOf({tag: 'todo', priority: 1}), '');
        assert.equal(markOf({tag: 'done', priority: 4}), '');
    });
});
