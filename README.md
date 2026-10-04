# Patinha

Rede social de resgate de animais de rua para Android e iOS. O lançamento inicial é em Belém/PA.

Esta etapa cobre o monorepo, a infra local e o app Expo em development build. O feed, o mapa e o login ainda não existem.

## Requisitos

- Node.js 22 ou mais recente (o CI usa Node 22)
- pnpm 10
- Docker

## Subir a infra

```bash
docker compose up -d
```

| Serviço  | Porta | Uso                         |
| -------- | ----- | --------------------------- |
| Postgres | 5435  | PostGIS 16, banco `patinha` |
| Redis    | 6380  | filas e cache               |
| MinIO    | 9000  | bucket `patinha-media`      |
| Console  | 9001  | console do MinIO            |
| imgproxy | 8080  | redimensionar imagens       |
| API      | 3010  | Fastify                     |

As portas do host evitam o Postgres, o Redis e a porta 3001 que já estão em uso nesta máquina. Dentro da rede do Compose, Postgres continua na 5432 e o Redis na 6379.

A imagem oficial `minio/minio` saiu do Docker Hub. O Compose usa `bitnamilegacy/minio:2025.7.23`, o mesmo servidor MinIO, e cria o bucket `patinha-media` na subida.

As credenciais locais estão no `.env.example`. Copie para `.env` se quiser sobrescrever os padrões. Sem esse arquivo, a API usa os mesmos valores do Docker Compose.

O imgproxy local aceita URLs sem assinatura. Antes de produção, defina `IMGPROXY_KEY` e `IMGPROXY_SALT` em hexadecimal.

## Scripts

```bash
pnpm dev:api      # http://localhost:3010
pnpm dev:web      # http://localhost:3000
pnpm dev:mobile   # Metro para o development build
pnpm lint
pnpm typecheck
pnpm test         # exige Postgres e Redis no ar
```

## Como testar a API

Com o Docker no ar:

```bash
pnpm dev:api
```

Em outro terminal:

```bash
curl http://localhost:3010/health
```

Resposta esperada:

```json
{ "status": "ok", "checks": { "database": "ok", "redis": "ok" } }
```

Se o banco ou o Redis estiver fora, a rota responde `503` com `"status": "degraded"`.

## App mobile

O projeto usa Expo SDK 57, Expo Router e um development build (não é Expo Go). Identificadores:

- iOS: `app.patinha.mobile`
- Android: `app.patinha.mobile`
- scheme: `patinha`

Os perfis do EAS estão em `apps/mobile/eas.json`: `development`, `preview` e `production`. O perfil `development` gera um cliente de desenvolvimento. No Android o artefato é um APK, instalável sem Mac. O build de iOS também roda na nuvem do EAS.

Na pasta `apps/mobile`:

1. Entre em [expo.dev](https://expo.dev) e faça login: `pnpm dlx eas-cli login`
2. Vincule o projeto: `pnpm dlx eas-cli init`
3. Gere o cliente:

```bash
pnpm dlx eas-cli build --profile development --platform android
pnpm dlx eas-cli build --profile development --platform ios
```

4. Instale o binário no aparelho e rode `pnpm dev:mobile`. A primeira tela mostra o nome Patinha.

Conferir a config sem gerar o binário:

```bash
pnpm --filter @patinha/mobile exec expo config --type public
```

## Firebase

Baixe os arquivos no console do Firebase e coloque em `apps/mobile/` (eles ficam fora do Git):

- Android: `google-services.json`, pacote `app.patinha.mobile`
- iOS: `GoogleService-Info.plist`, bundle `app.patinha.mobile`

Para push no iOS, o FCM precisa da chave APNs. No console do Firebase: configurações do projeto, Cloud Messaging, configuração do app Apple, envie a chave de autenticação APNs (arquivo `.p8`) com o Key ID e o Team ID. O checklist completo de publicação fica para a fase de notificações.

## Layout

```text
apps/mobile        Expo (Android e iOS)
apps/api           Fastify
apps/web           Next.js (páginas públicas)
packages/shared    schemas Zod compartilhados
```
