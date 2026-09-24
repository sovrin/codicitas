/**
 * Stand-ins for Jira and GitHub while the demo is recorded, preloaded with
 * node --import: fetch answers for acme.atlassian.net and api.github.com from
 * here, a moment late the way a real service is, and passes anything else on.
 * shop#482's checks run for a while and then pass, so refreshing shows them
 * change.
 */
const started = Date.now();
const real = globalThis.fetch;

/**
 * How long shop#482's checks run before they pass.
 */
const RUNNING = Number(process.env.DEMO_CHECKS_RUN_FOR ?? 20_000);

// a ticket's title, its status category and, once done, its resolution
const TICKETS = {
    'SHOP-298': ['Cart forgets its items after login', 'done', 'Done'],
    'SHOP-305': ['Cart empties on a second tab', 'done', 'Duplicate'],
    'SHOP-311': ['Payments fail silently on a timeout', 'indeterminate'],
    'OPS-72': ['Rotate the staging certificates', 'indeterminate'],
};

const PULLS = {
    'acme/shop#479': {title: 'Drop the legacy cart cookies', state: 'MERGED'},
    'acme/shop#482': {
        title: 'Retry failed payments with idempotency keys',
        state: 'OPEN',
        checks: () => (Date.now() - started > RUNNING ? 'SUCCESS' : 'PENDING'),
    },
    'acme/shop#490': {title: 'Dark mode for the order history', state: 'OPEN', checks: () => null},
    'acme/api#1498': {title: 'Bump the search index', state: 'CLOSED'},
    'acme/api#1502': {
        title: 'Rate limit the search endpoint',
        state: 'OPEN',
        checks: () => 'FAILURE',
    },
};

/**
 * A real service takes a moment, and not always the same.
 */
const late = () => new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 900));

const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

const jira = (key) => {
    const [summary, category, resolution] = TICKETS[key] ?? [];

    return summary
        ? json({
              fields: {
                  summary,
                  status: {statusCategory: {key: category}},
                  resolution: resolution ? {name: resolution} : null,
              },
          })
        : json({}, 404);
};

const github = ({owner, name, number}) => {
    const pull = PULLS[`${owner}/${name}#${number}`];

    if (!pull) {
        return json({data: {repository: null}, errors: [{type: 'NOT_FOUND'}]});
    }

    const checks = pull.checks?.();

    return json({
        data: {
            repository: {
                issueOrPullRequest: {
                    __typename: 'PullRequest',
                    title: pull.title,
                    state: pull.state,
                    commits: {
                        nodes: [{commit: {statusCheckRollup: checks ? {state: checks} : null}}],
                    },
                },
            },
        },
    });
};

globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    const ticket = /^https:\/\/acme\.atlassian\.net\/rest\/api\/2\/issue\/([^?]+)/.exec(url);

    if (ticket) {
        await late();

        return jira(decodeURIComponent(ticket[1]));
    }

    if (url === 'https://api.github.com/graphql') {
        await late();

        return github(JSON.parse(init.body).variables);
    }

    return real(input, init);
};
