# Sourced by demo.tape before recording starts: a fresh journal full of
# demo entries, Jira and GitHub answered by mock.mjs, and a clock that reads
# mid-afternoon, so the day has something behind it whenever this runs.

# the timezone in which it is 15:00 right now, give or take the minutes
TZ="$(node -e '
const hour = new Date().getUTCHours();
const offset = ((((15 - hour) % 24) + 24) % 24 + 11) % 24 - 11;
console.log(offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`);
')"
export TZ

export CODICITAS_DIR=/tmp/journal
rm -rf "$CODICITAS_DIR"
(cd /codicitas && npx --no-install tsx demo/seed.ts)

export NODE_OPTIONS="--import /codicitas/demo/mock.mjs"
export PS1='$ '
clear
