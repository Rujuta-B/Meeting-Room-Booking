# api/Dockerfile
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifest files first (before the rest of the source) so Docker can
# cache the `npm ci` layer - it only re-runs when package.json/lockfile
# actually change, not on every source edit, which makes rebuilds during
# development much faster.
COPY package*.json ./
RUN npm ci

COPY . .
# `prisma generate` produces the typed Prisma Client from schema.prisma -
# must run before `tsc`, since the TypeScript source imports types from
# the generated client.
RUN npx prisma generate
RUN npm run build

# --- Runtime stage: don't ship devDependencies (typescript, vitest, etc)
# or source .ts files in the final image, only the compiled output. ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install OpenSSL for Prisma (Alpine doesn't include it by default)
RUN apk add --no-cache openssl

COPY package*.json ./
# prisma/seed.ts is run directly (via tsx, see CMD below), not compiled by
# `npm run build` (that only covers rootDir "src" - see tsconfig.json) - so
# tsx has to be present in the runtime image too, even though it's
# otherwise a devDependency. A small, deliberate exception for a POC:
# restructuring the build to compile prisma/seed.ts alongside src/ isn't
# worth it just to avoid one extra dev package in the image.
#
# WHY `--include=dev` specifically, not a plain `npm install tsx` after
# `npm ci --omit=dev`: tsx is already listed in package.json's own
# devDependencies, so a plain `npm install tsx` sees it as "already
# satisfied" according to the manifest/lockfile and silently no-ops
# without actually installing the files `--omit=dev` just removed -
# `--include=dev` is what forces npm to actually materialize it on disk.
RUN npm ci --omit=dev && npm install --no-save --include=dev tsx

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# Deliberate POC simplification, documented here and in docker-compose.yml:
# migrations (and now seeding) run every time the container starts, not as
# a separate release step. Fine for a single instance; see
# docker-compose.yml's comment on what would need to change to safely run
# multiple instances. Seeding after migrating, before starting the server,
# is what lets `docker compose up` alone produce a fully demoable app (real
# rooms + a ready admin/user login) with no extra manual command - the
# seed script itself is idempotent (upserts users/attributes, only creates
# rooms if none exist yet), so re-running it on every restart is safe.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run prisma:seed && node dist/server.js"]
