FROM nginx:1.27-alpine
COPY docker/download-nginx.conf /etc/nginx/conf.d/default.conf
COPY download/index.html /usr/share/nginx/html/index.html
COPY apps/mobile/assets/paw-low.png /usr/share/nginx/html/paw.png
EXPOSE 80
