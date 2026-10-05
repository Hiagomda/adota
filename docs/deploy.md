# Deploy

Alvo: VPS com 4 vCPU e 8 GB de RAM, Ubuntu, Docker. Os serviços públicos saem só pelo Caddy nas portas 80 e 443. Postgres, Redis e MinIO não publicam porta no host.

## Primeira vez

1. Aponte `api.patinha.app`, `app.patinha.app` e `img.patinha.app` para o IP da VPS.
2. Crie o usuário de deploy, sem senha de root por SSH.
3. Firewall:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

4. Instale fail2ban e deixe a jail `sshd` ativa.
5. Clone o repositório em `/opt/patinha`.
6. Crie `/opt/patinha/.env` com `POSTGRES_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `IMGPROXY_KEY`, `IMGPROXY_SALT` e `FIREBASE_PROJECT_ID`. `AUTH_DEV_MODE` fica `false`.
7. Suba a stack: `docker compose -f docker-compose.prod.yml up -d --build`.
8. Rode a migração: `docker compose -f docker-compose.prod.yml exec -T api pnpm --filter @patinha/api db:migrate`.
9. No Uptime Kuma, em `127.0.0.1:3002`, monitore `https://api.patinha.app/health` e `https://app.patinha.app`.

## Backup

O script `docker/backup.sh` grava um dump custom do Postgres e apaga arquivos com mais de 14 dias. Agende no cron do host, uma vez por dia:

```bash
15 3 * * * cd /opt/patinha && BACKUP_DIR=/var/backups/patinha sh docker/backup.sh
```

Teste a restauração num banco vazio antes de precisar dela: `pg_restore --clean --if-exists`.

## Logs

Cada serviço usa o driver `json-file` com rotação de 10 MB e 3 arquivos. A API escreve logs estruturados do Fastify. Não coloque segredo em variável que o processo imprime.

## Atualizar

O workflow `.github/workflows/deploy.yml` é manual. Ele faz `git pull` e recria os containers pelo SSH. Os segredos do repositório são `DEPLOY_HOST`, `DEPLOY_USER` e `DEPLOY_SSH_KEY`.

## Memória

Limites somados: Postgres 2 GB, API 768 MB, MinIO 512 MB, imgproxy 512 MB, site 512 MB, Redis 256 MB, Uptime Kuma 256 MB, Caddy 128 MB. Sobra margem para o sistema nos 8 GB.
