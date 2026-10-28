# Égua, adota!

App de Belém/PA para animais de rua: resgate, adoção, Casa Amiga (lar temporário), ONGs, doação por PIX exibido (o app nunca recebe dinheiro) e voluntariado com XP, níveis e selos. Este arquivo é a fonte de verdade para agentes. Se `.cursor/rules` ou `apps/mobile/AGENTS.md` disserem outra coisa, vale o que está aqui.

## Stack

- Monorepo pnpm 9.15.9 (`packageManager`; o pnpm 10 não instala este lockfile), Node 22, `node-linker=hoisted`.
- `apps/mobile`: Expo SDK 57, RN 0.86, React 19.2, Expo Router (rotas tipadas), TanStack Query 5, Zustand, FlashList 2, expo-image, MapLibre 10.4.2 (com patch em `patches/`), Firebase JS 11 + `react-native-nitro-google-signin`, Sentry.
- `apps/api`: Fastify 5 rodando via `tsx` (sem build), SQL direto com `pg` e um pouco de Drizzle, BullMQ + Redis, PostgreSQL 16 + PostGIS, MinIO + imgproxy para fotos, firebase-admin para validar tokens.
- `apps/web`: Next.js com as páginas públicas (post, perfil, mapa). O painel da equipe agora mora no repositório `Hiagomda/AdotaSite` (pasta `admin/`); o `apps/admin` daqui é a versão antiga. O login do painel é só usuário e senha (`POST /admin/v1/login`, tabela `staff_passwords`). Para criar ou trocar um login: `pnpm --filter @patinha/api staff:login -- --username <usuario> --name "<Nome>" --role superadmin` (a senha é pedida no terminal ou vem de `STAFF_PASSWORD`; mínimo 12 caracteres).
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

- Proibido EAS e build na nuvem da Expo. Detalhes de Gradle/JDK em `.cursor/rules/android-windows-build.mdc`.
- A versão mora em `apps/mobile/version.json`. `pnpm --filter @patinha/mobile version:bump` sobe o build; `--sync` alinha o `android/app/build.gradle`; `version:publish` (ou `bump-build.mjs --publish`) escreve `download/version.json`, que é o que o app compara para oferecer atualização.
- A atualização vem só da VPS: ao abrir, `startStartupUpdateCheck()` (primeira ação em `app/_layout.tsx`) lê `<download>/version.json` com timeout de 3 s e nunca bloqueia a abertura. Não existe OTA (`expo-updates` foi removido).
- A versão e o build aparecem em Configurações, no perfil, em Suporte e na tela de erro (`src/diagnostics/VersionMark.tsx`).
- App web para iPhone: o workflow **Compilar APK** também roda `expo export --platform web` do mesmo commit e anexa `egua-adota-web.tar.gz` ao release `apk-<version>-<build>`. O `docker/download.Dockerfile` baixa esse arquivo ao lado do APK (mesma `APK_URL`) e serve em `<download>/app`. Como o download é HTTPS e a API/fotos/MinIO são HTTP, o nginx do download repassa `/api/`, `/img/` e `/media/`, e o app troca os endereços das respostas (`src/net/sameOrigin.ts`, `EXPO_PUBLIC_WEB_PROXY_ROUTES`). No iPhone o login é só por e-mail e não há push.

## Como publicar (APK + VPS) — playbook do agente

Quando o Hiago disser **"suba tudo"** / **"ssuba"** / publicar APK+VPS, faça **nesta ordem**. Não pule o Coolify: sem redeploy o `version.json` fica no build antigo e o celular não vê atualização. Commit/push/release/deploy só com pedido explícito (ou essa frase).

### Árvores neste PC

| Papel              | Caminho                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Edição / git       | `C:\Users\hiago\OneDrive\Área de Trabalho\Égua, adota!`                                                                |
| Compilação Android | `C:\dev\egua-adota` (tem `apps/mobile/android` + `node_modules` hoistado). Se faltar, use `C:\egua` com a mesma regra. |

Não compile a partir do OneDrive (caminho longo → CMake/ninja quebra). Não rode EAS. PowerShell: sem `&&`; quote `-P…`; `curl.exe`; shell com permissão total (`all`).

### 1. Código pronto na árvore de edição

1. Lint/typecheck/testes relevantes (API: unidade; integração só com Docker e aviso de TRUNCATE).
2. Em `apps/mobile/version.json`: suba `build` e escreva 2–4 `notes` em pt-BR (o que o aviso de update mostra).
3. `pnpm --filter @patinha/mobile version:bump` **ou** edite o JSON e rode `node apps/mobile/scripts/bump-build.mjs --sync` depois na árvore de compile.
4. Rode também o que grava a página: `node apps/mobile/scripts/bump-build.mjs --publish` (atualiza `download/version.json` com o mesmo `version` / `androidVersionCode` / `notes`). Atenção: o `--publish` **também sobe o build** em 1. Caminho simples: escreva as `notes` novas com o build **atual** e rode só o `--publish`; confira que os dois JSON ficaram com o mesmo número.
5. Em `docker/download.Dockerfile`, `ARG APK_URL=` → `https://github.com/Hiagomda/adota/releases/download/apk-<version>-<build>/egua-adota.apk` (ex.: `apk-0.1.0-22`).
6. Commit Conventional Commits em português + push em **`master`** (`origin` = `Hiagomda/adota`). Auto-review pode bloquear push: peça aprovação nativa e repita o mesmo `git push`.

### 2. Sincronizar e compilar o APK

**Caminho preferido:** Actions → **Compilar APK** → Run workflow (marque `publish` para criar o release `apk-<version>-<build>`). Compila numa máquina limpa com o secret `MOBILE_ENV`, roda `apps/mobile/scripts/check-apk.mjs` (chaves gravadas, HTTP no manifest, versionCode, assinatura igual a `vars.EXPECTED_SIGNER_SHA256`, API no ar) e substitui os passos 2 e 3 abaixo. O compilado no PC fica para emergência; nele também rode `pnpm --filter @patinha/mobile apk:check <apk>` antes do release e use `SENTRY_DISABLE_AUTO_UPLOAD=true` se o prebuild religar o envio ao Sentry.

- Disparar sem o navegador: `POST /repos/Hiagomda/adota/actions/workflows/build-apk.yml/dispatches` com `{"ref":"master","inputs":{"publish":true}}`, token via `git credential fill` num script temporário (mesma regra do passo 3). Leva ~15 min.
- O secret `MOBILE_ENV` é o `.env` inteiro do app. O GitHub não mostra o valor salvo e o _Update_ **substitui tudo**: a cópia completa está em `C:devegua-adotaappsmobile.env`. O agente não escreve secrets; o Hiago cola.
- `EXPO_PUBLIC_SENTRY_DSN` é obrigatório no release (trava no `app.config.ts` e no `check-apk`), junto com API, download, Firebase e Google.

1. Robocopy OneDrive → `C:\dev\egua-adota` com `/E`, **excluindo** `android`, `node_modules`, `.expo`, `.git`, `.env`. **Nunca** `/MIR`.
2. Não rode `pnpm install` completo. Se `@patinha/shared` quebrar o tsc, `pnpm --filter @patinha/shared build` na árvore de compile.
3. `node apps/mobile/scripts/bump-build.mjs --sync` em `C:\dev\egua-adota` para o `versionCode` do Gradle bater com `version.json`.
4. Confirme `C:\dev\egua-adota\apps\mobile\.env` com (não commitar, não imprimir valores além do host):
   - `EXPO_PUBLIC_API_URL=http://api-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io` (HTTP de propósito)
   - `EXPO_PUBLIC_DOWNLOAD_URL=https://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io`
5. Gradle **release** (não debug), JDK 17 já em `android/gradle.properties` (Adoptium sob `~/.gradle/jdks/…` neste PC):

```powershell
cd C:\dev\egua-adota\apps\mobile\android
$env:NODE_ENV = "production"
$env:GRADLE_USER_HOME = "C:\Users\hiago\.gradle"
$env:TEMP = "C:\Temp"; $env:TMP = "C:\Temp"
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a"
```

6. APK: `C:\dev\egua-adota\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`. Confira tamanho (~80–90 MB release; debug ~287 MB com tela de URL do dev-client está errado). `NODE_ENV=test` no shell quebra o bundle (babel); use `production`.

### 3. Release no GitHub

- Tag: `apk-<version>-<build>` (ex. `apk-0.1.0-22`). Asset obrigatório: **`egua-adota.apk`** (renomeie o `app-release.apk`).
- `gh` **não** está instalado. Use `git credential fill` (host=github.com) num script Node temporário em `C:\Temp` (API releases + upload do asset). **Nunca** imprima o token. **Delete** o script depois (não se auto-apague no meio do run).
- HEAD do asset deve ser 302 para release-assets; não cole a URL assinada no chat.

### 4. Deploy Coolify (obrigatório para o celular ver a att)

- Painel: `http://painel.86.48.25.233.sslip.io:8000` (não o IP cru — Kaspersky bloqueia). App: `adota:master-…` / id `fpmewu0com3qkbfihrsihc6y`.
- Compose: `docker-compose.coolify.yml`. Ao subir: API faz `db:migrate` + `db:seed` (`SEED_IF_EMPTY`) + `start`; o serviço `download` rebuilda com o `APK_URL` e copia `version.json` + APK.
- Clique no **Deploy do cabeçalho** (`wire:click=deploy` / botão roxo, ao lado de "More actions"), **não** no "Deploy" da sidebar (só expande seção). O clique às vezes não pega: confira no histórico (`…/application/fpmewu0com3qkbfihrsihc6y/deployment`) uma linha "In progress" antes de esperar; na página `/deployment` o botão do cabeçalho funcionou. Não clique Log out, Cancel, Danger Zone, nem upgrade do Coolify. Não toque MetalRiff, chatbot, teste-AtivaFacil.
- Websocket "Cannot connect to real-time service" é normal; o deploy ainda roda — acompanhe Deployment Logs / histórico.
- Auto-review pode bloquear o clique: peça aprovação e repita o **mesmo** clique.

### 5. Verificar

```powershell
curl.exe -sS "https://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io/version.json"
curl.exe -sS -I "https://download-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io/egua-adota.apk"
curl.exe -sS "http://api-fpmewu0com3qkbfihrsihc6y.86.48.25.233.sslip.io/health"
```

Espere `androidVersionCode` **igual ao build novo**, `Last-Modified` recente, APK com `Content-Length` do release. Só então diga ao Hiago para fechar e reabrir o app.

### Deploy (VPS) — referência rápida

- Coolify sobe `docker-compose.coolify.yml` a partir do GitHub **`master`**.
- Domínios de teste (sslip): API/MinIO/imgproxy em HTTP; download em HTTPS. Mudar host quebra APKs já instalados.
- `docker/download-entrypoint.sh` copia `/opt/egua-adota.apk` e `/opt/version.json` sobre o volume a cada start — cópia só no volume some no restart. Caminho durável = release GitHub + `APK_URL` no Dockerfile + redeploy.
- `docker-compose.prod.yml` + `deploy.yml` (Caddy em `/opt/patinha`) **não** estão em uso.
- Serviço `backup` (`docker/backup-loop.sh`): dump diário do Postgres às 3h de Belém (guarda 14 dias) e cópia das fotos por rsync, no volume `backups` da mesma VPS. Não é cópia fora da VPS.
- `publish-download.yml` espelha o APK do release `apk-<version>-<build>` lendo `download/version.json`.

## Estrutura

```
apps/api/src/register.ts      rotas principais (auth no hook onRequest → request.user)
apps/api/src/feed.ts          posts, status, localização aproximada
apps/api/src/adoptionChat.ts  conversa de adoção
apps/api/src/adoption.ts      ficha de quem quer adotar, fila de espera, feiras e cadastro de ONG
apps/api/src/staff/           rotas da equipe (login com senha, auditoria)
apps/api/src/passport.ts      passaporte do animal: saúde, guarda (resgate/lar/adoção) e junção de ocorrências
apps/api/src/fosterHomes.ts   Casa Amiga: vagas, pedidos de acolhimento e encerramento com XP
apps/api/src/central.ts       central de resgates (GET /central, por urgência) e ofertas de ajuda sem transporte
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
- Identidade "calor de casa paraense": turquesa `#1F7A7A`, coral `#F26B4E`, caramelo `#D98A3D`, fundo creme `#FFF8EE`, Baloo 2 nos títulos e Nunito no corpo. Mascote: vira-lata caramelo com coleira turquesa e plaquinha de patinha coral. Textura de fundo com ossinho e peixinho (`PetPattern`); o Hiago tirou o marajoara quadriculado. Detalhes de Belém (fitinha do Círio, mangueira). Use sempre os tokens de `src/theme`, nunca hex solto. Branco sobre coral não passa contraste, então superfície coral usa texto escuro.
- Mapa: a câmera centraliza na pessoa uma única vez e depois é dela. Nada recentraliza sozinho e não existe modo seguir (ele ficava ligado e puxava o mapa). "Minha localização" centraliza uma vez por toque; qualquer toque no mapa entrega a câmera à pessoa. Não existe botão "Buscar nesta área": quando o mapa para (movimento do app ou gesto da pessoa), a área visível carrega sozinha. O Hiago removeu o botão; não traga de volta.
- Admin do dono: o e-mail em `OWNER_EMAILS` vira admin só com `email_verified` do Firebase.

## Regras

- Não quebre APKs antigos: mudanças de API são retrocompatíveis (campos novos opcionais, nada renomeado ou removido).
- Autorização e validação sempre no servidor (`requireUser`, `requireRole`, schemas Zod). Nenhum segredo no repositório.
- Banco só por migração nova e reversível (arquivo em `db/migrations` + reverso em `db/down`), com aviso de backup antes.
- Nada de `catch {}` vazio. Erro esperado: trate e explique. Erro de "melhor esforço" (push, geocode): registre no log. Na API, falha do servidor nunca vira 401, porque o app desloga em 401.
- Rate limit: o global (600/min por IP) roda antes da autenticação. Rota de escrita nova usa `writeLimit` ou `strictLimit` de `register.ts`, que contam por conta, porque muitos celulares dividem o mesmo IP da operadora.
- Avisos dos recursos novos usam `notifyPeople` (`notify.ts`): grava em Alertas e manda push com `route` (tela que o app abre; lista fechada em `src/nearby/pushTarget.ts`). Apps antigos só entendem `postId`.
- Excluir conta (`anonymizeUser`): tabela nova com dado pessoal entra em `personalTables` ou ganha tratamento ali.
- Privacidade: feed e API pública devolvem localização aproximada (grade de ~500 m). Casa Amiga é casa de alguém: só autor, equipe e quem vai ajudar veem a lista, em km inteiros. A exata vai só para o autor, a equipe e quem respondeu "vou ajudar". Telefone nunca aparece no feed.
- Proibido vender animais. PIX só aparece em pedido de ajuda de perfil verificado.
- Antes de instalar biblioteca, diga qual, por quê e o impacto no tamanho. Para pacotes Expo use `pnpm expo install` dentro de `apps/mobile`.
- Nomes no código e tabelas em inglês. Commits (Conventional Commits com a descrição em português), comentários no código, textos do GitHub (releases, workflows) e textos da interface em português do Brasil. Pedido do Hiago em 17/10/2026; comentários antigos em inglês são traduzidos quando o arquivo for mexido.
- Não crie documentação além deste arquivo, salvo pedido.

## Armadilhas conhecidas

- O release Android usa a keystore de debug do PC de build. Se ela mudar, quem já instalou não consegue atualizar ("app não instalado"). Para a troca: o primeiro build com a chave nova leva `"reinstall": true` no `apps/mobile/version.json` (o `--publish` copia para `download/version.json`), e os apps a partir do build 36 mostram "Instale o aplicativo de novo" em vez de baixar por cima. A chave nova e o passo a passo ficaram com o Hiago (fora do repositório).
- `usesCleartextTraffic` está ligado porque API, MinIO e imgproxy são HTTP. O token Firebase trafega sem TLS até haver domínio com HTTPS.
- O Traefik do Coolify responde "404 page not found" ou "no available server" quando o container está unhealthy ou parado, não só quando a rota não existe.
- Typed routes: rotas novas só existem para o `tsc` depois de regenerar `.expo/types`.
- Prévia web (`npx expo start --web`, com a API local e `EXPO_PUBLIC_API_URL=http://localhost:3010`): módulo nativo importado direto derruba o bundle inteiro, então ele precisa de variante `.web.ts(x)` (ex.: `googleNative.web.ts`, `MapCanvas.web.tsx`). No web não existe `Image.resolveAssetSource`. Login de teste: `sessionStorage["egua-token"] = "dev:<email do seed>"`.
- MapLibre no New Architecture: os eventos de localização dele derrubavam o app em release. O patch em `patches/` corrige isso; não atualize o MapLibre sem testar um APK de release.
- MapLibre `setCamera` vira a prop nativa `stop` via `setNativeProps`, e o Fabric guarda essas props e pode reaplicá-las depois: o mapa voltava sozinho para o primeiro centro. A `<Camera>` fica num componente memorizado que nunca renderiza de novo (`StableCamera`) e, quando cada movimento do app termina, o `stop` gravado vira um destino neutro (sem centro nem zoom). Não regrave o `stop` com a vista onde a pessoa parou: a ordem chegava atrasada, com o dedo já num novo arrasto, e o mapa "teleportava" para trás (build 33). Não volte a mover a câmera por props declarativas. Estilos de camada ficam em constantes de módulo.
- Patas do mapa: `explore.tsx` acumula as já carregadas (`src/map/knownPaws.ts`, `mergePaws`) em vez de trocar a lista a cada arrasto, que fazia patas piscarem. Os marcadores (gota na cor da urgência com patinha) saem de `apps/mobile/scripts/paw-pins.mjs` (usa o `sharp` hoistado; rode em `C:devegua-adota`); a ponta é o ponto do animal (`iconAnchor: 'bottom'`).
- GitHub Actions: o heap padrão do prebuild estourou ("Java heap space"); o workflow passa `-Xmx6g` ao Gradle.
- Sentry: org `hiago-uq`, projeto `react-native`, plano grátis. O app manda erros desde o build 28. A API manda erros 500, falhas de "melhor esforço", do worker e do push quando `SENTRY_DSN` está preenchido no Coolify (`src/monitoring.ts`, sem tracing).
- O workflow **Vigia da VPS** confere API, fotos e download a cada 15 min e abre a issue "VPS fora do ar" quando algo cai (fecha sozinha quando volta). Sem `SENTRY_AUTH_TOKEN` os source maps não sobem (stack em código compilado) e o agente não lê o Sentry: o Hiago repassa o link do erro.

## Onde paramos (17/10/2026)

- No ar: build 30 (marcador de gota). Build 29 trouxe a correção da câmera e das patas piscando; falta o Hiago confirmar no celular. Se o mapa ainda voltar sozinho, pergunte em que momento (ao abrir, depois de tocar numa pata, ao voltar de outra tela).
- Roteiro combinado, em ordem: (2) observabilidade — falta o token do Sentry para source maps e logs da API; (3) domínio próprio + HTTPS (o Hiago precisa comprar o domínio; mudar o host quebra APKs antigos, então planejar transição); (4) trocar a keystore de debug por uma chave privada (exige reinstalação, campanha no app e SHA novo no Firebase); (5) produto: fluxo de adoção ponta a ponta, cadastro de ONG, compartilhar por WhatsApp, push por proximidade; (6) design: perfil próprio, Criar, chat, mapa, tema claro, estados vazios.
