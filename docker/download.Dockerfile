FROM nginx:1.27-alpine
ARG APK_URL=https://github.com/Hiagomda/adota/releases/download/apk-1.0.0-8/egua-adota.apk
COPY docker/download-nginx.conf /etc/nginx/conf.d/default.conf
COPY download/index.html /usr/share/nginx/html/index.html
COPY download/version.json /usr/share/nginx/html/version.json
COPY download/version.json /opt/version.json
COPY apps/mobile/assets/paw-low.png /usr/share/nginx/html/paw.png
COPY docker/download-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
  && if [ -n "$APK_URL" ]; then apk add --no-cache wget && wget -O /opt/egua-adota.apk "$APK_URL"; fi
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
