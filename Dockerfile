# NovaTradeX — simulated trading demo (multi-stage build, Alpine/musl runtime)
#
# The runtime image is Alpine on purpose. The Debian-based variants (bookworm and
# trixie) both fail the container image scan because glibc, acl, attr and gcc-14
# carry high/critical advisories with no fixed version published, so no apt
# upgrade can clear them. Alpine mirrors those packages with musl libc and a much
# smaller package set, so the compiler and the vulnerable OS packages are simply
# not present in the shipped layer.
#
# better-sqlite3 is a native module: Alpine ships no prebuilt binaries for musl,
# so the build stage keeps python3/make/g++ to compile it from source. Only the
# compiled artefacts reach the runtime stage.

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./

# Install with dev dependencies: `vite` is a devDependency and the client bundle
# must be built inside the image (dist/ is git-ignored). NODE_ENV=production is
# deliberately not set here — with it, npm omits devDependencies and the build
# fails with "vite: not found".
RUN npm ci --include=dev --no-audit --no-fund

COPY client ./client
COPY server ./server

# Client bundle (Vite) is served from dist/client by the Express server.
# Prune afterwards so only runtime dependencies are copied into the final image.
RUN npm run build && npm prune --omit=dev

# ---------- runtime stage ----------
# No compiler, no Python, no Debian packages: just Node, the musl runtime and the
# application.
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/dist ./dist

# SQLite lives here; mount a persistent volume at /data for durability.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000
CMD ["node", "server/index.js"]
