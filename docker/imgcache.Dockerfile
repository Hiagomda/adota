FROM nginx:1.27-alpine
COPY docker/imgcache-nginx.conf /etc/nginx/conf.d/default.conf
RUN mkdir -p /var/cache/imgproxy && chown nginx:nginx /var/cache/imgproxy
