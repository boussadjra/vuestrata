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

# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build

# The architecture this stage runs on, set by BuildKit: amd64 or arm64.
ARG TARGETARCH

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# The vite-plus CLI runs on a native binding for the platform it runs on. This
# line used to install the linux-x64 one unconditionally, and npm refuses a
# package built for another CPU, so the image could not be built on arm64
# (Apple Silicon, Graviton) at all. The legacy builder sets no TARGETARCH;
# dpkg reports the same names.
RUN arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
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

# Build configuration. These MUST be present at build time: Vite inlines
# import.meta.env into the bundle, and the vuestrata:env plugin validates them
# and fails the build on an invalid combination.
ARG VUESTRATA_RUNTIME_MODE=production
ARG VUESTRATA_AUTH_ADAPTER=jwt
ARG VUESTRATA_API_URL=/api
ARG VUESTRATA_APP_TITLE=Vuestrata
ARG VUESTRATA_SESSION_PERSISTENCE=refresh-cookie
ARG VUESTRATA_RELEASE
ENV VUESTRATA_RUNTIME_MODE=$VUESTRATA_RUNTIME_MODE \
    VUESTRATA_AUTH_ADAPTER=$VUESTRATA_AUTH_ADAPTER \
    VUESTRATA_API_URL=$VUESTRATA_API_URL \
    VUESTRATA_APP_TITLE=$VUESTRATA_APP_TITLE \
    VUESTRATA_SESSION_PERSISTENCE=$VUESTRATA_SESSION_PERSISTENCE \
    VUESTRATA_RELEASE=$VUESTRATA_RELEASE

# Regenerate the security headers for THIS deployment's API origin.
#
# The committed copies assume a same-origin `/api` behind a reverse proxy. A
# cross-origin backend needs its origin in `connect-src`, and getting that
# wrong is silent in the worst way: a path is not a valid CSP source, and one
# invalid source makes the browser discard the entire directive. Deriving it
# from the same variable the app fetches with is what keeps them agreeing.
#
# The same variable decides whether nginx answers an unrouted same-origin API
# path with a JSON 502 (see docker/nginx.conf).
RUN node scripts/security/sync-headers.mjs --api-url="$VUESTRATA_API_URL"

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
COPY --from=build /app/dist /usr/share/nginx/html

# The server block and the header snippet are GENERATED from
# scripts/security/headers.mjs — one definition shared with vercel.json,
# public/_headers and index.html, with `vpr lint` failing on drift. They used
# to be a `printf` heredoc inside this file, which is how they fell out of sync.
COPY --from=build /app/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf

USER nginx
EXPOSE 8080

# /healthz is answered by nginx itself (docker/nginx.conf), so a probe learns
# whether the server is up without fetching the app every 30 seconds. BusyBox
# wget is part of every Alpine image; curl is not guaranteed to be.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
