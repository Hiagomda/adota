FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# O pnpm confere todo patchedDependencies, mesmo de pacote que esta imagem não instala.
COPY patches patches
COPY apps/admin/package.json apps/admin/package.json
RUN pnpm install --frozen-lockfile --filter @patinha/admin...

FROM deps AS build
COPY apps/admin apps/admin
# Host do imgproxy para a CSP das miniaturas (entra no build do Next).
ARG ADMIN_MEDIA_ORIGIN=http://localhost:8080
ENV ADMIN_MEDIA_ORIGIN=$ADMIN_MEDIA_ORIGIN
RUN pnpm --filter @patinha/admin build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3020
# ADMIN_API_URL aponta para a API na rede interna (ex.: http://api:3010).
CMD ["pnpm", "--filter", "@patinha/admin", "start"]
