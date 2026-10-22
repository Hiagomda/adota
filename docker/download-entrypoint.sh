#!/bin/sh
set -eu

if [ -f /opt/egua-adota.apk ]; then
  cp -f /opt/egua-adota.apk /apk/egua-adota.apk
fi

if [ -f /opt/version.json ]; then
  cp -f /opt/version.json /apk/version.json
fi

# Host público do MinIO (sem http://). O envio de fotos do app web passa por /media/ e a
# assinatura do endereço só confere com esse Host.
: "${MINIO_PUBLIC_HOST:=minio:9000}"
export MINIO_PUBLIC_HOST
envsubst '${MINIO_PUBLIC_HOST}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
