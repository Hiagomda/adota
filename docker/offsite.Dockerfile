# Envio dos backups para fora da VPS (criptografado). Ver docker/offsite-loop.sh.
FROM rclone/rclone:1.68.2
COPY docker/offsite-loop.sh /usr/local/bin/offsite-loop.sh
RUN chmod +x /usr/local/bin/offsite-loop.sh
ENTRYPOINT ["/usr/local/bin/offsite-loop.sh"]
