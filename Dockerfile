# Dear Swritsinh: web service (Next.js). Railway builds this from the repo root.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@9.15.9 && pnpm --version
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG CSP_EXTRA_MEDIA_ORIGINS=""
ENV CSP_EXTRA_MEDIA_ORIGINS=$CSP_EXTRA_MEDIA_ORIGINS
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fontconfig \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app -d /app app
COPY --from=build --chown=app:app /app /app
USER app
EXPOSE 3000
# Railway injects PORT; `next start` reads it and binds 0.0.0.0.
CMD ["pnpm", "start"]
