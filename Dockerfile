# NovaTradeX — simulated trading demo
FROM node:20-bookworm-slim

# better-sqlite3 ships prebuilt binaries, but keep a toolchain available so a
# source build still succeeds on unusual platforms.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./

# Install with dev dependencies: `vite` is a devDependency and the client bundle
# must be built inside the image (dist/ is git-ignored). NODE_ENV=production is
# deliberately not set here — with it, npm omits devDependencies and the build
# fails with "vite: not found".
RUN npm ci --include=dev --no-audit --no-fund

COPY . .

# Client bundle (Vite) is served from dist/client by the Express server.
RUN npm run build

ENV NODE_ENV=production

# Non-persistent during a fresh container; mount a volume at /data for durability.
RUN mkdir -p /data

EXPOSE 3000

CMD ["npm", "start"]
