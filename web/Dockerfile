# web/Dockerfile
#
# Two-stage build: compile the React app to static files, then serve those
# static files with nginx - the final image never contains Node, the dev
# server, or any of the build tooling, just plain HTML/CSS/JS.
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* variables into the compiled JS bundle AT BUILD TIME -
# they are NOT read from the environment when the container starts later.
# This ARG is how docker-compose.yml's `build.args.VITE_API_URL` reaches
# this build step; `ENV` re-exposes it to the `npm run build` process
# below, which is what Vite actually reads.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# --- Runtime stage ---
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
