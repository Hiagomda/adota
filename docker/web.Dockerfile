FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm validates every entry in patchedDependencies, even for packages this image never installs.
COPY patches patches
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @patinha/web...

FROM deps AS build
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=https://api.patinha.app
ARG NEXT_PUBLIC_SITE_URL=https://app.patinha.app
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN pnpm --filter @patinha/web build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@patinha/web", "start"]
