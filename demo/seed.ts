/**
 * Fills a journal with a few believable days of work, for recording the demo.
 * Dated from today back, whenever it runs, and written the way codi add
 * writes: /tags, !priorities, >due dates and all. Jira and GitHub are set up against the
 * stand-ins in mock.mjs.
 */
import {prepare} from '#/services/journal';
import * as store from '#/services/store';
import {toClock, toKey} from '#/utils';

/**
 * The working days before today, the most recent first, weekends left out.
 *
 * @param count
 */
const workdays = (count: number): string[] => {
    const days: string[] = [];
    const date = new Date();

    while (days.length < count) {
        date.setDate(date.getDate() - 1);

        if (date.getDay() !== 0 && date.getDay() !== 6) {
            days.push(toKey(date));
        }
    }

    return days;
};

/**
 * So long ago today, as a time: today's entries end shortly before now.
 *
 * @param minutes
 */
const ago = (minutes: number): string => toClock(new Date(Date.now() - minutes * 60_000));

const write = (day: string, time: string, line: string): void => {
    const entry = prepare(line, 'note');

    store.add(day, {...entry, time: entry.time ?? time});
};

const [yesterday, before] = workdays(2);

write(before, '09:10', '/done paired with @anna on SHOP-298, the cart survives the login now');
write(before, '11:00', '/meet sprint planning with @jonas and @mira');
write(before, '14:20', '/til advisory locks in #postgres go with the session, not the transaction');
write(before, '16:40', '/done shipped shop#479');

write(yesterday, '09:30', '/done spiked #payments retries, they need idempotency keys');
write(yesterday, '11:15', '/blocked OPS-72 waiting on @jonas for the staging certificates');
write(yesterday, '13:50', '/todo !c fix SHOP-311 before the release');
write(yesterday, '15:30', '/note api#1498 closed for a smaller change');
write(yesterday, '16:20', '/note SHOP-305 was SHOP-298 all along');
write(yesterday, '17:05', '/todo !l tidy the #payments dashboards');

write(toKey(), ago(390), '/done idempotency keys are in shop#482');
// close enough to the first entry to leave out the break, making room for
// the todo the demo writes
write(toKey(), ago(350), '/meet standup');
write(toKey(), ago(250), '/todo !h >tod review api#1502 with @mira');
write(toKey(), ago(140), '/done wrote the runbook for #payments retries');
write(toKey(), ago(55), '/todo shop#490 needs screenshots');

store.saveSetting('gap', 45);
store.saveSetting('jira', true);
store.saveSetting('jiraSite', 'acme.atlassian.net');
store.saveSetting('jiraEmail', 'you@acme.dev');
store.saveSetting('jiraToken', 'not-a-real-token-1234');
store.saveSetting('github', true);
store.saveSetting('githubRepositories', {shop: 'acme/shop', api: 'acme/api'});
store.saveSetting('githubToken', 'not-a-real-token-5678');
store.close();
