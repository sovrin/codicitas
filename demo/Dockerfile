# VHS, which records the demo, with Node and codicitas built from this repository.
FROM node:24-trixie-slim AS node

FROM ghcr.io/charmbracelet/vhs:latest

# codi draws ✓ ● ○ and the like, which tmux only passes on in a UTF-8 locale
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8

# tmux draws the captions, in its status bar above codi
RUN apt-get update \
    && apt-get install -y --no-install-recommends tmux \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /codicitas

# dependencies first, so changing the code does not install them again
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi

COPY . .
RUN npm run build && chmod +x dist/codi.js && ln -s /codicitas/dist/codi.js /usr/local/bin/codi

ENTRYPOINT ["vhs"]
CMD ["demo/demo.tape"]
