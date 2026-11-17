#!/bin/sh
# Cópia dos backups para fora da VPS, criptografada antes de sair (rclone crypt).
#
# Lê o volume `backups` só para leitura: nunca mexe nos dumps nem nas fotos da VPS.
# Sem OFFSITE_S3_BUCKET ou sem OFFSITE_ENCRYPTION_PASSWORD fica desligado (só dorme).
#
# A cada 15 min confere se o serviço `backup` fez um backup bom novo (ultimo-backup.txt mudou) e:
#   banco/  copia os dumps novos; nunca apaga nem sobrescreve um dump que já está lá fora
#   fotos/  espelha a cópia das fotos (foto apagada no "Excluir conta" some lá fora também)
# Grava /status/ultimo-envio.txt quando dá certo; a vigia da API alerta se ficar velho.
# Apagar dumps antigos lá fora fica com a regra de ciclo de vida do bucket (ex.: 30 dias).
#
# Restaurar (em qualquer máquina com rclone e as mesmas variáveis):
#   rclone lsf cifrado:banco
#   rclone copy cifrado:banco/patinha-AAAAMMDD-HHMMSS.dump .
#   pg_restore --clean --if-exists -d patinha patinha-AAAAMMDD-HHMMSS.dump
# Sem a senha de criptografia os arquivos lá fora não abrem: guarde-a fora da VPS.
set -eu

backups="${BACKUP_DIR:-/backups}"
status_dir="${STATUS_DIR:-/status}"

if [ -z "${OFFSITE_S3_BUCKET:-}" ] || [ -z "${OFFSITE_ENCRYPTION_PASSWORD:-}" ]; then
  echo "offsite: desligado (falta OFFSITE_S3_BUCKET ou OFFSITE_ENCRYPTION_PASSWORD)"
  exec sleep 2147483647
fi

# Tudo vem das variáveis abaixo; um arquivo de config vazio só cala o aviso "config not found".
export RCLONE_CONFIG=/tmp/rclone.conf
: > "$RCLONE_CONFIG"
export RCLONE_CONFIG_EXTERNO_TYPE=s3
export RCLONE_CONFIG_EXTERNO_PROVIDER="${OFFSITE_S3_PROVIDER:-Other}"
export RCLONE_CONFIG_EXTERNO_ENDPOINT="${OFFSITE_S3_ENDPOINT:-}"
export RCLONE_CONFIG_EXTERNO_REGION="${OFFSITE_S3_REGION:-}"
export RCLONE_CONFIG_EXTERNO_ACCESS_KEY_ID="${OFFSITE_S3_ACCESS_KEY_ID:-}"
export RCLONE_CONFIG_EXTERNO_SECRET_ACCESS_KEY="${OFFSITE_S3_SECRET_ACCESS_KEY:-}"
# A chave pode não ter permissão de criar bucket: o bucket já existe.
export RCLONE_CONFIG_EXTERNO_NO_CHECK_BUCKET=true

export RCLONE_CONFIG_CIFRADO_TYPE=crypt
export RCLONE_CONFIG_CIFRADO_REMOTE="externo:${OFFSITE_S3_BUCKET}/${OFFSITE_PREFIX:-egua-adota}"
RCLONE_CONFIG_CIFRADO_PASSWORD="$(rclone obscure "$OFFSITE_ENCRYPTION_PASSWORD")"
export RCLONE_CONFIG_CIFRADO_PASSWORD

mkdir -p "$status_dir"
sent_marker="$status_dir/enviado-de.txt"

send() {
  echo "offsite: enviando o backup de $1"
  # --immutable: um dump que já existe lá fora nunca é trocado.
  # Cada passo com `|| return 1`: dentro de `if ! send` o `set -e` não vale, e sem isso um envio
  # que falhou ainda marcaria o backup como enviado.
  rclone copy "$backups/banco" cifrado:banco --immutable --include 'patinha-*.dump' || return 1
  rclone sync "$backups/fotos" cifrado:fotos || return 1
  count="$(rclone lsf cifrado:banco | wc -l | tr -d ' ')" || return 1
  printf '%s\n' "$1" > "$sent_marker"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$status_dir/ultimo-envio.txt"
  echo "offsite: ok ($count dumps lá fora)"
}

while true; do
  current="$(cat "$backups/ultimo-backup.txt" 2>/dev/null || true)"
  previous="$(cat "$sent_marker" 2>/dev/null || true)"
  if [ -n "$current" ] && [ "$current" != "$previous" ]; then
    if ! send "$current"; then
      echo "offsite: ERRO no envio; tenta de novo em 15 min" >&2
    fi
  fi
  sleep 900
done
