# Égua, adota!

App de Belém/PA para animais de rua: resgate, adoção, Casa Amiga (lar temporário), ONGs, doação por PIX exibido (o app nunca recebe dinheiro) e voluntariado com XP, níveis e selos. Este arquivo é a fonte de verdade para agentes. Se `.cursor/rules` ou `apps/mobile/AGENTS.md` disserem outra coisa, vale o que está aqui.

## Stack

- Monorepo pnpm 9.15.9 (`packageManager`; o pnpm 10 não instala este lockfile), Node 22, `node-linker=hoisted`.
- `apps/mobile`: Expo SDK 57, RN 0.86, React 19.2, Expo Router (rotas tipadas), TanStack Query 5, Zustand, FlashList 2, expo-image, MapLibre 10.4.2 (com patch em `patches/`), Firebase JS 11 + `react-native-nitro-google-signin`, Sentry.
- `apps/api`: Fastify 5 rodando via `tsx` (sem build), SQL direto com `pg` e um pouco de Drizzle, BullMQ + Redis, PostgreSQL 16 + PostGIS, MinIO + imgproxy para fotos, firebase-admin para validar tokens.
- `apps/web`: Next.js com as páginas públicas (post, perfil, mapa). `apps/admin`: painel da equipe (Next.js, porta 3020, login com TOTP).
- `packages/shared`: schemas Zod e tipos usados pela API e pelo app. Rode `pnpm --filter @patinha/shared build` antes do resto (os scripts da raiz já fazem isso).

## Comandos (raiz)

```bash
pnpm install --frozen-lockfile
docker compose up -d              # Postgres 5435, Redis 6380, MinIO 9000, imgproxy 8080
pnpm db:migrate && pnpm db:seed   # banco local com dados de exemplo
pnpm dev:api                      # API em :3010
pnpm dev:mobile                   # Metro para o development build
pnpm typecheck                    # todos os pacotes
pnpm lint                         # prettier --check + eslint + expo lint + next lint
pnpm test                         # vitest (api, shared) + node:test (mobile)
```

- Os testes de integração da API (`*.integration.test.ts`) precisam do Docker rodando (`docker compose up -d postgres redis minio`). Sem Docker eles falham com `ECONNREFUSED 5435`; os de unidade passam. Eles dão TRUNCATE no banco local `patinha`: rode `pnpm db:seed` depois se precisar dos dados de exemplo.
- Os testes do mobile são arquivos `*.test.ts` listados no script `test` de `apps/mobile/package.json`. Ao criar um, inclua-o lá. Eles rodam em Node puro, então só testam módulos sem import de React Native ou Expo.
- Type-check do mobile com erro em rota (`/chat/...` não é atribuível): o `.expo/types/router.d.ts` local está velho. Ele é gerado ao rodar `npx expo start`.
- Rode o Prettier pela raiz. Dentro de `apps/mobile` ele não lê o `.prettierignore` e reformata `serviceArea.ts` (polígono de Belém) em milhares de linhas.

## Build do APK e versão

- Proibido EAS e build na nuvem da Expo. O APK de release é compilado no Android Studio a partir de `C:\egua` (caminho curto por causa do limite de 250 caracteres do CMake no Windows). O passo a passo está em `.cursor/rules/android-windows-build.mdc`.
- A versão mora em `apps/mobile/version.json`. `pnpm --filter @patinha/mobile version:bump` sobe o build, e `version:publish` escreve `download/version.json`, que é o que o app compara para oferecer atualização.
- A atualização vem só da VPS: ao abrir, `startStartupUpdateCheck()` (primeira ação em `app/_layout.tsx`) lê `<download>/version.json` com timeout de 3 s e nunca bloqueia a abertura. Não existe OTA (`expo-updates` foi removido).
- A versão e o build aparecem em Configurações, no perfil, em Suporte e na tela de erro (`src/diagnostics/VersionMark.tsx`).

## Deploy (VPS com Coolify)

- O Coolify sobe `docker-compose.coolify.yml` a partir do GitHub (`master`). A API roda `db:migrate`, `db:seed` (com `SEED_IF_EMPTY=true` só remove conteúdo de demonstração) e `start` a cada boot.
- Domínios fixos, todos em HTTP no sslip enquanto não há domínio próprio: `api-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io`, `imgproxy-…`, `minio-…` e `download-…` (este responde em HTTPS). O APK tem a URL da API embutida, então mudar esses hosts quebra os APKs instalados.
- `docker-compose.prod.yml` + `deploy.yml` são o caminho antigo (Caddy em `/opt/patinha`) e não estão em uso.
- `publish-download.yml` publica o APK do release `apk-<version>-<build>` lendo `download/version.json`.
- Não mexa nos projetos MetalRiff, chatbot e teste-AtivaFacil do Coolify.

## Estrutura

```
apps/api/src/register.ts      rotas principais (auth no hook onRequest → request.user)
apps/api/src/feed.ts          posts, status, localização aproximada
apps/api/src/adoptionChat.ts  conversa de adoção
apps/api/src/staff/           rotas da equipe (TOTP, auditoria)
apps/api/db/migrations        SQL numerado; db/down tem o reverso
apps/mobile/app/              telas (Expo Router)
apps/mobile/src/components/ui design system (Button, Card, StateLayout, Skeleton...)
apps/mobile/src/theme/        tokens de cor, espaçamento, tipografia, claro/escuro
apps/mobile/src/map/          MapCanvas + cameraPolicy (testada)
apps/mobile/src/place/        GPS, PlacePicker, upload e fila offline de publicação
apps/mobile/src/crash/        reporter, ErrorBoundary, tela de erro
download/                     página de download servida pelo container `download`
```

## Decisões já tomadas

- Não existe carona solidária ou transporte. Ainda há resíduos no app (selo "Piloto do Bem", estado `transport`) e no backend (coluna `is_transport_available`, `action_type 'transport'`, `helpKind 'transport'`, selo `good_pilot`). O app remove os visuais; os dados do backend ficam até o dono limpar.
- Sem Cloudflare, CDN, proxy ou R2. As fotos ficam no MinIO da VPS e são servidas pelo imgproxy. Variáveis `R2_*` que sobraram são ignoradas.
- Identidade "calor de casa paraense": turquesa `#1F7A7A`, coral `#F26B4E`, caramelo `#D98A3D`, fundo creme `#FFF8EE`, Baloo 2 nos títulos e Nunito no corpo. Mascote: vira-lata caramelo com coleira turquesa e plaquinha de patinha coral. Detalhes de Belém (marajoara sutil, fitinha do Círio, mangueira). Use sempre os tokens de `src/theme`, nunca hex solto. Branco sobre coral não passa contraste, então superfície coral usa texto escuro.
- Mapa: a câmera centraliza na pessoa uma única vez e depois é dela. Nada recentraliza sozinho. Existem "Minha localização" e "Buscar nesta área": movimentos do app (abertura, GPS, "Ver no mapa") carregam sozinhos; gesto da pessoa só mostra o botão (`onCommitBounds` recebe `fromUser`).
- Admin do dono: o e-mail em `OWNER_EMAILS` vira admin só com `email_verified` do Firebase.

## Regras

- Não quebre APKs antigos: mudanças de API são retrocompatíveis (campos novos opcionais, nada renomeado ou removido).
- Autorização e validação sempre no servidor (`requireUser`, `requireRole`, schemas Zod). Nenhum segredo no repositório.
- Banco só por migração nova e reversível (arquivo em `db/migrations` + reverso em `db/down`), com aviso de backup antes.
- Nada de `catch {}` vazio. Erro esperado: trate e explique. Erro de "melhor esforço" (push, geocode): registre no log. Na API, falha do servidor nunca vira 401, porque o app desloga em 401.
- Rate limit: o global (600/min por IP) roda antes da autenticação. Rota de escrita nova usa `writeLimit` ou `strictLimit` de `register.ts`, que contam por conta, porque muitos celulares dividem o mesmo IP da operadora.
- Excluir conta (`anonymizeUser`): tabela nova com dado pessoal entra em `personalTables` ou ganha tratamento ali.
- Privacidade: feed e API pública devolvem localização aproximada (grade de ~500 m). Casa Amiga é casa de alguém: só autor, equipe e quem vai ajudar veem a lista, em km inteiros. A exata vai só para o autor, a equipe e quem respondeu "vou ajudar". Telefone nunca aparece no feed.
- Proibido vender animais. PIX só aparece em pedido de ajuda de perfil verificado.
- Antes de instalar biblioteca, diga qual, por quê e o impacto no tamanho. Para pacotes Expo use `pnpm expo install` dentro de `apps/mobile`.
- Código, tabelas e commits em inglês (Conventional Commits). Textos da interface em português do Brasil.
- Não crie documentação além deste arquivo, salvo pedido.

## Armadilhas conhecidas

- O release Android usa a keystore de debug do PC de build. Se ela mudar, quem já instalou não consegue atualizar ("app não instalado").
- `usesCleartextTraffic` está ligado porque API, MinIO e imgproxy são HTTP. O token Firebase trafega sem TLS até haver domínio com HTTPS.
- O Traefik do Coolify responde "404 page not found" ou "no available server" quando o container está unhealthy ou parado, não só quando a rota não existe.
- Typed routes: rotas novas só existem para o `tsc` depois de regenerar `.expo/types`.
- Prévia web (`npx expo start --web`, com a API local e `EXPO_PUBLIC_API_URL=http://localhost:3010`): módulo nativo importado direto derruba o bundle inteiro, então ele precisa de variante `.web.ts(x)` (ex.: `googleNative.web.ts`, `MapCanvas.web.tsx`). No web não existe `Image.resolveAssetSource`. Login de teste: `sessionStorage["egua-token"] = "dev:<email do seed>"`.
- MapLibre no New Architecture: os eventos de localização dele derrubavam o app em release. O patch em `patches/` corrige isso; não atualize o MapLibre sem testar um APK de release.
