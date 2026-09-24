import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import jira, {jiraOf, title, toSite} from '#/modules/jira';
import {Refused} from '#/modules/module';

const CLOUD = {site: 'https://acme.atlassian.net', email: 'me@acme.io', token: 'secret'};

const answer = (status: number, body: unknown = {}) => {
    const calls: {url: string; headers: Record<string, string>}[] = [];
    const request = (async (url: string, init: RequestInit) => {
        calls.push({url, headers: init.headers as Record<string, string>});

        return new Response(JSON.stringify(body), {status});
    }) as unknown as typeof fetch;

    return {calls, request};
};

describe('toSite', () => {
    it('makes what was typed into an address', () => {
        assert.equal(toSite(' acme.atlassian.net/ '), 'https://acme.atlassian.net');
        assert.equal(toSite('http://jira.internal:8080//'), 'http://jira.internal:8080');
        assert.equal(toSite(''), '');
    });
});

describe('jiraOf', () => {
    it('needs a site and a token, the token falling back to the environment', () => {
        assert.equal(jiraOf({site: '', email: '', token: 'x'}, {}), undefined);
        assert.equal(jiraOf({site: 'acme.atlassian.net', email: '', token: ''}, {}), undefined);
        assert.deepEqual(
            jiraOf(
                {site: 'acme.atlassian.net', email: '', token: ''},
                {JIRA_API_TOKEN: 'from-env'},
            ),
            {
                site: 'https://acme.atlassian.net',
                email: '',
                token: 'from-env',
            },
        );
        assert.equal(
            jiraOf({site: 'acme', email: '', token: 'typed'}, {JIRA_API_TOKEN: 'from-env'}).token,
            'typed',
        );
    });
});

describe('title', () => {
    it('asks for the summary alone, signing in with email and token on Cloud', async () => {
        const {calls, request} = answer(200, {fields: {summary: ' Download times out '}});

        assert.equal(await title(CLOUD, 'ACME-4217', undefined, request), 'Download times out');
        assert.equal(
            calls[0].url,
            'https://acme.atlassian.net/rest/api/2/issue/ACME-4217?fields=summary',
        );
        assert.equal(
            calls[0].headers.Authorization,
            `Basic ${Buffer.from('me@acme.io:secret').toString('base64')}`,
        );
    });

    it('sends a personal access token as it is, without an email', async () => {
        const {calls, request} = answer(200, {fields: {summary: 'x'}});

        await title({...CLOUD, email: ''}, 'ACME-1', undefined, request);
        assert.equal(calls[0].headers.Authorization, 'Bearer secret');
    });

    it('says null for a ticket Jira does not know', async () => {
        assert.equal(await title(CLOUD, 'UTF-8', undefined, answer(404).request), null);
    });

    it('tells a refused token apart from anything else going wrong', async () => {
        await assert.rejects(title(CLOUD, 'ACME-1', undefined, answer(401).request), Refused);
        await assert.rejects(title(CLOUD, 'ACME-1', undefined, answer(403).request), Refused);
        await assert.rejects(
            title(CLOUD, 'ACME-1', undefined, answer(502).request),
            (reason) => !(reason instanceof Refused),
        );
    });
});

describe('the Jira module', () => {
    const settings = {jira: true, jiraSite: 'acme.atlassian.net', jiraEmail: '', jiraToken: 'x'};

    it('knows tickets, and no other topics', () => {
        assert.equal(jira.matches('ACME-4217'), true);
        assert.equal(jira.matches('#412'), false);
        assert.equal(jira.matches('#auth'), false);
    });

    it('is set up once it has a site and a token, keeping titles per site', () => {
        assert.equal(jira.connect({...settings, jiraSite: ''}, {}), undefined);

        const source = jira.connect(settings, {});

        assert.equal(source.scope, 'https://acme.atlassian.net');
        assert.equal(source.link('ACME-4217'), 'https://acme.atlassian.net/browse/ACME-4217');
    });

    it('starts out off', () => {
        assert.equal(jira.defaults.jira, false);
    });
});
