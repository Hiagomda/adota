#!/bin/sh
# Roda para sempre: um backup ao subir e depois um por dia no horário BACKUP_HOUR_UTC.
#   /backups/banco  dumps do Postgres (formato custom), os de mais de BACKUP_KEEP_DAYS dias somem
#   /backups/fotos  cópia do volume do MinIO, atualizada por rsync (foto apagada no app some aqui
#                   também, por causa do "Excluir conta")
# Restaurar o banco: pg_restore --clean --if-exists -d patinha <arquivo>. Restaurar as fotos: parar
# o MinIO e copiar /backups/fotos de volta para o volume dele.
set -eu

keep_days="${BACKUP_KEEP_DAYS:-14}"
dir="${BACKUP_DIR:-/backups}"
minio="${MINIO_DIR:-/minio}"
hour="${BACKUP_HOUR_UTC:-6}"
mkdir -p "$dir/banco" "$dir/fotos"

run_backup() {
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  file="$dir/banco/patinha-$stamp.dump"
  if pg_dump --host="${PGHOST:-postgres}" --username=patinha --format=custom --file="$file.tmp" patinha; then
    mv "$file.tmp" "$file"
    echo "backup: banco ok ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "backup: ERRO no dump do banco" >&2
  fi
  find "$dir/banco" -name 'patinha-*.dump' -mtime +"$keep_days" -delete
  if rsync -a --delete "$minio/" "$dir/fotos/"; then
    echo "backup: fotos ok ($(du -sh "$dir/fotos" | cut -f1))"
  else
    echo "backup: ERRO na cópia das fotos" >&2
  fi
  date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/ultimo-backup.txt"
}

run_backup
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $hour:00" +%s)
  if [ "$next" -le "$now" ]; then next=$((next + 86400)); fi
  sleep $((next - now))
  run_backup
done
