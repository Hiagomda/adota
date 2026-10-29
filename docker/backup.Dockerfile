# Backup diário do banco e das fotos, dentro da própria VPS (Coolify).
# Mesma imagem do Postgres, que já está baixada na VPS e traz o pg_dump 16. Sem apt-get: a imagem
# é Debian 11, que saiu dos espelhos, e o apt-get update quebrava o deploy (exit 100).
FROM postgis/postgis:16-3.5
COPY docker/backup-loop.sh /usr/local/bin/backup-loop.sh
RUN chmod +x /usr/local/bin/backup-loop.sh
ENTRYPOINT ["/usr/local/bin/backup-loop.sh"]
