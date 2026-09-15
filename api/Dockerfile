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
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# Deliberate POC simplification, documented here and in docker-compose.yml:
# migrations run every time the container starts, not as a separate
# release step. Fine for a single instance; see docker-compose.yml's
# comment on what would need to change to safely run multiple instances.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
