#!/bin/sh
# Records the demo into demo/demo.gif and the README's screenshot into
# demo/screenshot.png: VHS in Docker, against a seeded journal and stand-ins
# for Jira and GitHub, so it needs no accounts. The image is rebuilt when
# codicitas changed, and taken from the cache otherwise.
#
#   npm run record
set -eu

cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
    echo "record: Docker is not running; start it and try again" >&2
    exit 1
fi

docker compose run --build --rm demo

echo "record: wrote demo/demo.gif and demo/screenshot.png"
