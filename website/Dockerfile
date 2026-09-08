# Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# The schema and its config must exist BEFORE `npm ci`, because package.json's
# postinstall runs `prisma generate` — on a clean build there is no node_modules
# to fall back on, so generating without a schema fails the whole install.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle at build time; values supplied
# only to the running container never reach the browser. Compose passes these as
# build args (see docker-compose.yml).
ARG NEXT_PUBLIC_SERVER_NAME
ARG NEXT_PUBLIC_SITE_DOMAIN
ARG NEXT_PUBLIC_SERVER_IP
ARG NEXT_PUBLIC_SERVER_VERSION
ARG NEXT_PUBLIC_VK_URL
ARG NEXT_PUBLIC_DISCORD_URL
ARG NEXT_PUBLIC_TELEGRAM_URL
ENV NEXT_PUBLIC_SERVER_NAME=$NEXT_PUBLIC_SERVER_NAME \
    NEXT_PUBLIC_SITE_DOMAIN=$NEXT_PUBLIC_SITE_DOMAIN \
    NEXT_PUBLIC_SERVER_IP=$NEXT_PUBLIC_SERVER_IP \
    NEXT_PUBLIC_SERVER_VERSION=$NEXT_PUBLIC_SERVER_VERSION \
    NEXT_PUBLIC_VK_URL=$NEXT_PUBLIC_VK_URL \
    NEXT_PUBLIC_DISCORD_URL=$NEXT_PUBLIC_DISCORD_URL \
    NEXT_PUBLIC_TELEGRAM_URL=$NEXT_PUBLIC_TELEGRAM_URL

# postinstall above already generated the client against this exact schema.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Migration toolchain, installed as its own dependency tree.
#
# `migrate deploy` needs the prisma CLI, which loads prisma.config.ts through
# @prisma/config — and that pulls in c12, effect, empathic, deepmerge-ts and
# their own transitive deps. Copying a hand-written list of packages out of the
# builder looks like it works (next build still succeeds) and then fails at
# container start the moment that list drifts, so let npm resolve the tree.
# The version is taken from the app's own package.json, so it cannot skew.
WORKDIR /opt/prisma
COPY --from=builder /app/package.json ./app-package.json
RUN npm init -y > /dev/null \
 && npm install --no-audit --no-fund --omit=dev \
      "prisma@$(node -p "require('./app-package.json').dependencies.prisma.replace(/^[^0-9]*/, '')")" \
 && rm app-package.json \
 && npm cache clean --force

WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# schema.prisma carries only the provider (Prisma 7 rejects `url` there), so the
# datasource comes from this config — it must exist at runtime, together with
# the dotenv it imports.
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"


# check-secrets gates startup on placeholder credentials (fails closed).
# The CLI runs from /opt/prisma but resolves the schema and config against /app.
CMD ["sh", "-c", "node scripts/check-secrets.mjs && node /opt/prisma/node_modules/prisma/build/index.js migrate deploy && node server.js"]
