#!/bin/sh
# Roda para sempre: um backup ao subir e depois um por dia no horário BACKUP_HOUR_UTC.
#   /backups/banco  dumps do Postgres (formato custom), os de mais de BACKUP_KEEP_DAYS dias somem
#   /backups/fotos  cópia do volume do MinIO, refeita inteira a cada backup (foto apagada no app
#                   some aqui também, por causa do "Excluir conta")
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
  dump_ok=0
  # Confere o dump lendo ele inteiro: arquivo cortado (disco cheio, queda) não conta como bom.
  if pg_dump --host="${PGHOST:-postgres}" --username=patinha --format=custom --file="$file.tmp" patinha \
    && pg_restore --file=/dev/null "$file.tmp"; then
    mv "$file.tmp" "$file"
    dump_ok=1
    echo "backup: banco ok ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.tmp"
    echo "backup: ERRO no dump do banco" >&2
  fi
  find "$dir/banco" -name 'patinha-*.dump' -mtime +"$keep_days" -delete
  # Sem rsync na imagem: copia para uma pasta nova e só troca quando a cópia termina.
  rm -rf "$dir/fotos.tmp"
  if mkdir -p "$dir/fotos.tmp" && cp -a "$minio/." "$dir/fotos.tmp/"; then
    rm -rf "$dir/fotos"
    mv "$dir/fotos.tmp" "$dir/fotos"
    echo "backup: fotos ok ($(du -sh "$dir/fotos" | cut -f1))"
  else
    rm -rf "$dir/fotos.tmp"
    echo "backup: ERRO na cópia das fotos" >&2
  fi
  # Só um dump bom conta como "último backup": a vigia da API alerta quando ele envelhece, e o
  # envio externo só manda quando isto muda.
  if [ "$dump_ok" = 1 ]; then date -u +%Y-%m-%dT%H:%M:%SZ > "$dir/ultimo-backup.txt"; fi
  restore_test_if_due
}

# Teste de restauração isolado: restaura o dump mais novo num Postgres temporário dentro deste
# container (porta e socket só locais, apagado no fim) e confere que as tabelas voltaram. Nunca
# toca o banco de produção. Roda no máximo a cada RESTORE_TEST_EVERY_DAYS dias; a vigia da API
# alerta se ultimo-teste-restauracao.txt envelhecer.
restore_test_if_due() {
  every_days="${RESTORE_TEST_EVERY_DAYS:-7}"
  mark="$dir/ultimo-teste-restauracao.txt"
  if [ -f "$mark" ] && [ -z "$(find "$mark" -mtime +"$((every_days - 1))")" ]; then return 0; fi
  latest="$(ls -1t "$dir"/banco/patinha-*.dump 2>/dev/null | head -1)"
  [ -n "$latest" ] || return 0
  if restore_test "$latest"; then
    date -u +%Y-%m-%dT%H:%M:%SZ > "$mark"
  else
    echo "restauração: ERRO no teste com $(basename "$latest")" >&2
  fi
}

restore_test() {
  bin="$(pg_config --bindir)"
  tmp="$(mktemp -d /tmp/restauracao.XXXXXX)"
  chown postgres "$tmp"
  as_pg() { su postgres -s /bin/sh -c "$1"; }
  ok=0
  if as_pg "$bin/initdb -D $tmp/data -A trust -U postgres >/dev/null" \
    && as_pg "$bin/pg_ctl -D $tmp/data -w -l $tmp/log -o \"-p 5499 -k $tmp -c listen_addresses='' -c shared_buffers=16MB -c fsync=off\" start >/dev/null" \
    && as_pg "$bin/createdb -h $tmp -p 5499 teste" \
    && as_pg "$bin/pg_restore -h $tmp -p 5499 -d teste --no-owner --no-privileges --exit-on-error $1"; then
    expected="$(pg_restore --list "$1" | grep -c 'TABLE DATA')"
    restored="$(as_pg "$bin/psql -h $tmp -p 5499 -d teste -Atc \"SELECT count(*) FROM pg_stat_user_tables\"")"
    users="$(as_pg "$bin/psql -h $tmp -p 5499 -d teste -Atc \"SELECT count(*) FROM users\"")"
    if [ "$restored" -ge "$expected" ] && [ "$users" -ge 1 ]; then
      ok=1
      echo "restauração: ok ($(basename "$1"), $restored tabelas, $users contas)"
    else
      echo "restauração: ERRO tabelas $restored de $expected, contas $users" >&2
    fi
  fi
  as_pg "$bin/pg_ctl -D $tmp/data -m immediate stop >/dev/null 2>&1" || true
  rm -rf "$tmp"
  [ "$ok" = 1 ]
}

run_backup
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $hour:00" +%s)
  if [ "$next" -le "$now" ]; then next=$((next + 86400)); fi
  sleep $((next - now))
  run_backup
done
