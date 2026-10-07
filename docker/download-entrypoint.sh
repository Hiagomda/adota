#!/bin/sh
set -eu

if [ -f /opt/egua-adota.apk ]; then
  cp -f /opt/egua-adota.apk /apk/egua-adota.apk
fi

if [ -f /opt/version.json ]; then
  cp -f /opt/version.json /apk/version.json
fi

exec nginx -g 'daemon off;'
