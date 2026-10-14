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

No teste e em produção, as fotos podem ir para o Cloudflare R2 em vez do MinIO. Preencha `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET` juntos. O app continua pedindo o link assinado à API e envia a foto direto para o R2. O imgproxy precisa de `R2_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` e `R2_S3_REGION=auto`. Sem essas variáveis, o armazenamento continua no MinIO.

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

No app, a tela de entrada tem esses atalhos. O login com Google abre o seletor de conta no próprio app. Quem publicou o resgate pode editar a descrição, a urgência e as fotos, ou excluir o resgate. No mapa, cada resgate aberto mostra a patinha em qualquer zoom, e o cartão de resumo fecha quando esse resgate deixa de aparecer. No início, a busca e um filtro curto ficam no topo, e as fotos dos resgates vêm em seguida. O atalho de transporte saiu. O resgate pode ter um nome, porte e sexo, e a foto do perfil é encaixada num círculo. No feed, as outras fotos passam com o dedo. Quem deixou os avisos ligados e está dentro do próprio raio recebe o resgate novo. O atalho Doar só mostra as campanhas. Pedido com Pix só a equipe publica, e o app não recebe dinheiro. Dá para publicar um animal já para adoção. A foto de outra pessoa aparece no perfil dela. Quem quer adotar conversa com quem cuida dentro do app: a conversa é só dos dois, o telefone fica oculto, dá para denunciar e bloquear, e venda ou Pix não passam na mensagem. Quando combinam, quem cuida marca como adotado. O card mostra a distância de quem está vendo até o animal. No mapa, as patinhas da área visível aparecem sozinhas, e a localização usa o último ponto do GPS quando o sinal novo demora. Quem tocou em "Eu vou ajudar" pode dizer que não conseguiu (o pedido volta para Aberto se ninguém mais estiver indo) ou que não encontrou o animal. O site público mostra a localização aproximada. O ponto exato só volta para o autor, a moderação ou quem ainda está ajudando naquele resgate.

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

A versão instalada no teste é um alpha (`0.1.0`). O aviso de atualização mostra até quatro frases curtas do que mudou, publicadas em `download/version.json` no campo `notes`. Ajustes mostra só a versão.

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
