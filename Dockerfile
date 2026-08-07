# Stage 1: Build
FROM node:22-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.0 vite-plus@0.1.16 @voidzero-dev/vite-plus-linux-x64-gnu@0.1.16

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN node -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));delete pkg.scripts?.prepare;fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2)+'\n');"
RUN vp install --frozen-lockfile

COPY . .

# Build configuration. These MUST be present at build time: Vite inlines
# import.meta.env into the bundle, and the vuestrata:env plugin validates them
# and fails the build on an invalid combination. Previously none were passed,
# so the image always built with an unconfigured auth adapter.
#
# This image is the REAL PRODUCTION target — see vercel.json for the demo.
ARG VUESTRATA_RUNTIME_MODE=production
ARG VUESTRATA_AUTH_ADAPTER=jwt
ARG VUESTRATA_API_URL=/api
ARG VUESTRATA_APP_TITLE=Vuestrata
ENV VUESTRATA_RUNTIME_MODE=$VUESTRATA_RUNTIME_MODE \
    VUESTRATA_AUTH_ADAPTER=$VUESTRATA_AUTH_ADAPTER \
    VUESTRATA_API_URL=$VUESTRATA_API_URL \
    VUESTRATA_APP_TITLE=$VUESTRATA_APP_TITLE

RUN vp build

# Belt-and-braces: production builds emit no sourcemaps (see vite.config.ts),
# but if that ever changes, never publish them — they would be fetchable by
# guessing the chunk name. Upload them to an error tracker out-of-band instead.
RUN find dist -name '*.map' -delete

# Stage 2: Serve
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production

USER root
COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback + full security header set. Keep CSP in sync with public/_headers and index.html.
RUN printf 'server {\n\
  listen 8080;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  server_tokens off;\n\
  \n\
  # Security headers\n\
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;\n\
  add_header Content-Security-Policy "default-src '\''self'\''; script-src '\''self'\''; style-src '\''self'\'' '\''unsafe-inline'\'' https://fonts.googleapis.com; font-src '\''self'\'' https://fonts.gstatic.com; img-src '\''self'\'' data: blob:; connect-src '\''self'\''; worker-src '\''self'\'' blob:; frame-ancestors '\''none'\''; base-uri '\''self'\''; form-action '\''self'\''; object-src '\''none'\''" always;\n\
  add_header X-Content-Type-Options "nosniff" always;\n\
  add_header X-Frame-Options "DENY" always;\n\
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;\n\
  add_header Cross-Origin-Opener-Policy "same-origin" always;\n\
  add_header Cross-Origin-Resource-Policy "same-origin" always;\n\
  \n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
    add_header Cache-Control "public, max-age=0, must-revalidate" always;\n\
  }\n\
  location /assets/ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, max-age=31536000, immutable" always;\n\
  }\n\
  location ~* \\.(?:js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, max-age=31536000, immutable" always;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
