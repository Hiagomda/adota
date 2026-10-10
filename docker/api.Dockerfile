FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
# pnpm validates every entry in patchedDependencies, even for packages this image never installs.
COPY patches patches
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --filter @patinha/api...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @patinha/shared build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3010
CMD ["pnpm", "--filter", "@patinha/api", "start"]
