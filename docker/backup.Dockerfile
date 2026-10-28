# Backup diário do banco e das fotos, dentro da própria VPS (Coolify).
# Mesma imagem do Postgres, que já está baixada na VPS e traz o pg_dump 16.
FROM postgis/postgis:16-3.5
RUN apt-get update \
  && apt-get install -y --no-install-recommends rsync \
  && rm -rf /var/lib/apt/lists/*
COPY docker/backup-loop.sh /usr/local/bin/backup-loop.sh
RUN chmod +x /usr/local/bin/backup-loop.sh
ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]
