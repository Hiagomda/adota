#!/bin/sh
set -eu

directory="${BACKUP_DIR:-/var/backups/patinha}"
keep_days="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$directory"
stamp="$(date +%Y%m%d-%H%M%S)"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U patinha --format=custom patinha \
  > "$directory/patinha-$stamp.dump"
find "$directory" -name 'patinha-*.dump' -mtime +"$keep_days" -delete
