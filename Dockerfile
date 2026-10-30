# NovaTradeX — simulated trading demo
FROM node:20-bookworm-slim

# better-sqlite3 ships prebuilt binaries, but keep a toolchain available so a
# source build still succeeds on unusual platforms.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Client bundle (Vite) is served from dist/client by the Express server.
RUN npm run build

# Non-persistent during a fresh container; mount /data for durability.
RUN mkdir -p /data

EXPOSE 3000

CMD ["npm", "start"]
