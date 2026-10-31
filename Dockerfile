# NovaTradeX — simulated trading demo (multi-stage build)
#
# Debian 13 ("trixie") is used for both stages on purpose: Debian 12's glibc still
# carries unfixed critical advisories, while trixie ships the patched glibc, gnutls
# and perl. The build toolchain stays in the builder stage so the shipped runtime
# image contains no compiler and no build-only OS packages.

# ---------- build stage ----------
FROM node:22-trixie-slim AS build
WORKDIR /app

# better-sqlite3 ships prebuilt binaries, but keep a toolchain available so a
# source build still succeeds on unusual platforms.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

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
FROM node:22-trixie-slim AS runtime
WORKDIR /app

# Apply the Debian point releases that fix packages with an available patch.
# No compiler, Python or build-only packages are installed in this stage.
RUN apt-get update \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

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
