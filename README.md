# Égua, adota!

Rede social de resgate de animais de rua para Android e iOS. O lançamento inicial é em Belém/PA.

O site em `http://localhost:3000` lista alertas reais de Belém. O app Expo entra com contas locais, sem arquivo do Firebase.

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
pnpm db:migrate
pnpm db:seed      # recria as contas e os alertas de Belém
pnpm dev:api      # http://localhost:3010
pnpm dev:web      # http://localhost:3000
pnpm dev:mobile   # Metro para o development build
pnpm lint
pnpm typecheck
pnpm test         # exige Postgres e Redis no ar
```

Contas locais, senha nenhuma. O token é `dev:<e-mail>`:

| E-mail           | Uso                   |
| ---------------- | --------------------- |
| maria@egua.local | pessoa                |
| patas@egua.local | ONG verificada        |
| admin@egua.local | moderação em `/admin` |

No app, a tela de entrada tem esses atalhos. Google e Apple aparecem na interface e explicam que precisam do Firebase. O site público mostra a localização aproximada. O ponto exato só volta para o autor, a moderação ou quem tocou em "Eu vou ajudar".

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

- iOS: `app.egua.adota`
- Android: `app.egua.adota`
- scheme: `egua`

Os perfis do EAS estão em `apps/mobile/eas.json`: `development`, `preview` e `production`. O perfil `development` gera um cliente de desenvolvimento. No Android o artefato é um APK, instalável sem Mac. O build de iOS também roda na nuvem do EAS.

Na pasta `apps/mobile`:

1. Entre em [expo.dev](https://expo.dev) e faça login: `pnpm dlx eas-cli login`
2. Vincule o projeto: `pnpm dlx eas-cli init`
3. Gere o cliente:

```bash
pnpm dlx eas-cli build --profile development --platform android
pnpm dlx eas-cli build --profile development --platform ios
```

4. Instale o binário no aparelho e rode `pnpm dev:mobile`. No Windows, sem Android Studio, `pnpm dev:mobile:preview` abre a mesma interface num quadro de celular no navegador.

O perfil `preview` gera um APK que já fala com a API de teste em `http://api-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io`. A página para baixar esse arquivo é `http://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io`. Essa VPS já usa o proxy do Coolify nas portas 80 e 443, então o teste sobe com `docker-compose.coolify.yml`, sem um segundo Caddy.

O app confere atualização ao abrir e ao voltar para primeiro plano. Mudança de JavaScript publicada com `eas update --channel preview` pede confirmação e, se a pessoa aceitar, baixa e recarrega. Um APK novo não entra por esse caminho: a página publica `version.json` com `version` e `androidVersionCode`, e o Android pede para baixar `egua-adota.apk` quando esses números são maiores que os do app instalado. Suba o `versionCode` em `apps/mobile/app.config.ts` e o mesmo valor em `download/version.json` sempre que publicar outro binário. A imagem do serviço `download` baixa o APK de `APK_URL` (o padrão está no Dockerfile) e, ao subir, copia esse arquivo e o `version.json` para o volume `apk`.

Conferir a config sem gerar o binário:

```bash
pnpm --filter @patinha/mobile exec expo config --type public
```

## Firebase

Baixe os arquivos no console do Firebase e coloque em `apps/mobile/` (eles ficam fora do Git):

- Android: `google-services.json`, pacote `app.egua.adota`
- iOS: `GoogleService-Info.plist`, bundle `app.egua.adota`

O passo a passo da chave APNs está em `docs/notificacoes.md`. A publicação nas lojas está em `docs/publicacao.md`. O deploy da VPS está em `docs/deploy.md`.

## Layout

```text
apps/mobile        Expo (Android e iOS)
apps/api           Fastify
apps/web           Next.js (páginas públicas)
packages/shared    schemas Zod compartilhados
```
