FROM nginx:1.27-alpine
ARG APK_URL=https://github.com/Hiagomda/adota/releases/download/apk-0.1.0-36/egua-adota.apk
# Vira /etc/nginx/conf.d/default.conf no entrypoint, com o host público do MinIO preenchido.
COPY docker/download-nginx.conf /etc/nginx/templates/default.conf.template
COPY docker/download-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY docker/download-app-headers.conf /etc/nginx/snippets/app-headers.conf
COPY download/index.html /usr/share/nginx/html/index.html
COPY download/google.html /usr/share/nginx/html/google.html
COPY download/version.json /usr/share/nginx/html/version.json
COPY download/version.json /opt/version.json
COPY apps/mobile/assets/paw-low.png /usr/share/nginx/html/paw.png
COPY docker/download-entrypoint.sh /entrypoint.sh
# O app web do iPhone sai no mesmo release do APK (egua-adota-web.tar.gz). Releases antigos não
# têm o arquivo: aí /app mostra um aviso em vez de derrubar o build da página.
RUN chmod +x /entrypoint.sh \
  && rm -f /etc/nginx/conf.d/default.conf \
  && mkdir -p /usr/share/nginx/html/app \
  && if [ -n "$APK_URL" ]; then \
    apk add --no-cache wget \
    && wget -O /opt/egua-adota.apk "$APK_URL" \
    && if wget -O /tmp/web.tar.gz "${APK_URL%/*}/egua-adota-web.tar.gz"; then \
      tar -xzf /tmp/web.tar.gz -C /usr/share/nginx/html/app && rm /tmp/web.tar.gz; \
    else echo "Release sem egua-adota-web.tar.gz: o app web fica para o próximo build."; fi; \
  fi \
  && if [ ! -f /usr/share/nginx/html/app/index.html ]; then \
    printf '%s\n' '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Égua, adota!</title><p style="font-family:sans-serif;padding:24px">A versão para iPhone sai no próximo build do app. Volte em breve.</p>' > /usr/share/nginx/html/app/index.html; \
  fi
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
