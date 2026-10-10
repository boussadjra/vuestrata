# syntax=docker/dockerfile:1
#
# The REAL PRODUCTION target — see vercel.json for the demo.
#
# Tool versions here are checked against the rest of the repo by
# `node scripts/lint/check-toolchain-pins.mjs`, which runs in `vpr lint`. They
# had drifted badly: this image pinned pnpm 10.33.0 against a repo declaring
# pnpm 11.20.0, and vite-plus 0.1.16 against an installed 0.2.9. The image
# therefore built with a different toolchain than CI ever exercised.
#
# Both base images are pinned by digest as well as tag. A tag is a pointer its
# publisher moves; a digest is one exact image, so a rebuild cannot quietly
# pick up a different one. Dependabot (the `docker` entry in
# .github/dependabot.yml) proposes the new digest when a tag moves.
#
# Builds for linux/amd64 and linux/arm64:
#   docker buildx build --platform linux/arm64 -t vuestrata .
#
# BUILD ONCE, RUN ANYWHERE. The image is not tied to an environment: what
# differs between staging and production is read when the container STARTS.
#   docker run -e VUESTRATA_API_URL=https://api.staging.example.com vuestrata
# See docker/entrypoint.d/40-vuestrata-runtime.sh, and "Build once, deploy
# many" in docs/8.deployment/2.real-production.md for the variables.

# The API URL, declared before the first FROM so both stages share one default:
# the build inlines it, and the final stage hands it to the entrypoint.
ARG VUESTRATA_API_URL=/api

# The path prefix the app is served under: "/" for the root of its origin,
# "/console/" for https://portal.example.com/console/. Shared by both stages as
# well: the build puts it in every asset URL, and the final stage copies the
# build to the matching place under the web root. Unlike the API URL it CANNOT
# be changed when a container starts.
#   docker build --build-arg VUESTRATA_BASE_PATH=/console/ -t console .
# See "Serve under a path prefix" in docs/8.deployment/2.real-production.md.
ARG VUESTRATA_BASE_PATH=/

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build

# The architecture this stage runs on, set by BuildKit: amd64 or arm64.
ARG BUILDARCH

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# The vite-plus CLI runs on a native binding for the platform it runs on. This
# line used to install the linux-x64 one unconditionally, and npm refuses a
# package built for another CPU, so the image could not be built on arm64
# (Apple Silicon, Graviton) at all. Web assets are portable, so the builder
# stays native even for a different runtime target. This avoids emulating the
# Node/Rolldown build; only dist/ crosses into the target's nginx image.
RUN arch="${BUILDARCH:-$(dpkg --print-architecture)}" \
 && case "$arch" in \
      amd64) binding=@voidzero-dev/vite-plus-linux-x64-gnu@0.2.9 ;; \
      arm64) binding=@voidzero-dev/vite-plus-linux-arm64-gnu@0.2.9 ;; \
      *) echo "vite-plus has no Linux binding for '$arch'. Build for linux/amd64 or linux/arm64." >&2; exit 1 ;; \
    esac \
 && npm install -g pnpm@11.20.0 vite-plus@0.2.9 "$binding"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `comark` is a committed tarball (see vendor/README.md), so it must be present
# before install resolves the lockfile.
COPY vendor/ ./vendor/
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));delete pkg.scripts?.prepare;fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)+'\n');"
RUN vp install --frozen-lockfile

COPY . .

# Build configuration. Vite inlines import.meta.env into the bundle, and the
# vuestrata:env plugin validates these and fails the build on an invalid
# combination.
#
# The runtime mode, the auth adapter and the base path decide what is IN the
# bundle, so they exist only here. The others are defaults: a container may be started with a
# different API URL, title, session persistence or release (and an
# error-reporting DSN), and the value it is started with wins.
ARG VUESTRATA_RUNTIME_MODE=production
ARG VUESTRATA_AUTH_ADAPTER=jwt
ARG VUESTRATA_API_URL
ARG VUESTRATA_APP_TITLE=Vuestrata
ARG VUESTRATA_SESSION_PERSISTENCE=refresh-cookie
ARG VUESTRATA_RELEASE
ARG VUESTRATA_BASE_PATH
ENV VUESTRATA_RUNTIME_MODE=$VUESTRATA_RUNTIME_MODE \
    VUESTRATA_AUTH_ADAPTER=$VUESTRATA_AUTH_ADAPTER \
    VUESTRATA_BASE_PATH=$VUESTRATA_BASE_PATH \
    VUESTRATA_API_URL=$VUESTRATA_API_URL \
    VUESTRATA_APP_TITLE=$VUESTRATA_APP_TITLE \
    VUESTRATA_SESSION_PERSISTENCE=$VUESTRATA_SESSION_PERSISTENCE \
    VUESTRATA_RELEASE=$VUESTRATA_RELEASE

# Regenerate the header targets from scripts/security/headers.mjs and
# src/modules/app/config/deploy.config.ts, so the image can never carry a copy
# that someone forgot to regenerate after editing either.
#
# What nginx gets is a server block and three files under docker/runtime/: two
# templates and a list of variable names. The entrypoint fills them when the
# container starts, from the environment it starts in. That is what lets one
# image serve every environment, where this step used to bake one API origin
# into the CSP.
#
# --runtime-config says so to the generator, for the two things that follow
# from it. The page's CSP <meta> leaves connections to the header, which this
# image always sends: a browser enforces the tag as well, and a tag naming one
# API origin would block the one a container is started with. And the list
# records the API URL of THIS build (--api-url), which the entrypoint uses for
# a container started with none, so its headers allow what its bundle calls.
#
# --base-path is where the app is served from: the nginx locations, the SPA
# fallback and the answer for what lies outside the prefix follow it. The
# generator validates the value on its own, so a base path that could not be
# written into a server configuration stops the build here.
#
# Before `vp build`, because index.html is one of the targets.
RUN node scripts/security/sync-headers.mjs --runtime-config --api-url="$VUESTRATA_API_URL" \
      --base-path="$VUESTRATA_BASE_PATH"

# A checkout made on Windows with `core.autocrlf` ends these files in \r\n. A
# shell script whose first line is "#!/bin/sh\r" does not run at all, so the
# line endings are settled here rather than left to the machine that built.
RUN sed -i 's/\r$//' docker/entrypoint.d/*.sh docker/runtime/* docker/nginx.conf

RUN vp build

# Stamp the build so a running deployment can be identified without guessing
# which commit produced it. Served at /version.json; see plugins/build-info.ts.
RUN node scripts/build/write-version.mjs

# Belt-and-braces: production builds emit no sourcemaps (see vite.config.ts),
# but if that ever changes, never publish them — they would be fetchable by
# guessing the chunk name. Upload them to an error tracker out-of-band instead.
RUN find dist -name '*.map' -delete

# Compress every text asset once, here, at the slowest and smallest level.
# nginx's gzip_static sends the .gz beside a file to any client that accepts
# gzip, so no request pays for compressing it. -k keeps the original for the
# clients that do not; -n leaves the name and timestamp out of the header, so
# one build gives the same bytes every time. Under 1 KiB, gzip saves too little
# to be worth a second file.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' \
      -o -name '*.svg' -o -name '*.txt' -o -name '*.webmanifest' -o -name '*.wasm' \) \
      -size +1k -exec gzip -k -9 -n {} +

# ─── Stage 2: serve ──────────────────────────────────────────────────────────
# The stable branch (even minor version) of nginx. The image used to track 1.27,
# a mainline branch that stopped receiving fixes once it was superseded.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:ed04ec1ff34502c339ee5c3ae3f855442398edc1d05591e2b98981dcbbd20b1e AS production

USER root
# The build goes where its URLs say it is: the web root itself for the default
# base path "/", and <web root>/console/ for "/console/". nginx's `root` then
# stays the web root, and a request path names a file under it as it always
# did. The value was validated by the generator in the build stage.
ARG VUESTRATA_BASE_PATH
COPY --from=build /app/dist /usr/share/nginx/html$VUESTRATA_BASE_PATH

# The server block is GENERATED from scripts/security/headers.mjs — one
# definition shared with vercel.json, public/_headers and index.html, with
# `vpr lint` failing on drift. It used to be a `printf` heredoc inside this
# file, which is how the copies fell out of sync.
COPY --from=build /app/docker/nginx.conf /etc/nginx/conf.d/default.conf

# What the entrypoint renders from, and the entrypoint itself. The nginx image
# runs every executable *.sh in /docker-entrypoint.d before it starts the
# server, and skips one that is not executable, so the mode is set here rather
# than trusted to the checkout (with chmod, not COPY --chmod, which the legacy
# builder does not have). Not under /etc/nginx/templates: the image's own
# 20-envsubst-on-templates.sh would try to process anything placed there.
COPY --from=build /app/docker/runtime/ /etc/vuestrata/runtime/
COPY --from=build /app/docker/entrypoint.d/ /docker-entrypoint.d/
RUN chmod 0755 /docker-entrypoint.d/40-vuestrata-runtime.sh

# The entrypoint reads the API URL from the container's environment: its origin
# goes into the CSP, or its path gets the unrouted-API answer. This makes the
# value the image was BUILT with the default, so a container started with
# nothing set agrees with its bundle. `docker run -e VUESTRATA_API_URL=…`
# replaces it, for the app and for the headers alike. A container started with
# the variable set to nothing (`-e VUESTRATA_API_URL=`, a Helm `value: ""`)
# gets the same URL from /etc/vuestrata/runtime/keys, where the build stage
# recorded it.
#
# Only the API URL needs this. Any other variable the headers depend on
# (`connectSrcFromEnv` in deploy.config.ts) must be in the container's
# environment at start: a value given only as a build argument is in the
# bundle, where the entrypoint cannot see it.
ARG VUESTRATA_API_URL
ENV VUESTRATA_API_URL=$VUESTRATA_API_URL

USER nginx
EXPOSE 8080

# /healthz is answered by nginx itself (docker/nginx.conf), so a probe learns
# whether the server is up without fetching the app every 30 seconds. BusyBox
# wget is part of every Alpine image; curl is not guaranteed to be.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
