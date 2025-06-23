# FROM nginx:1.25-alpine

# # Install necessary packages for SSL
# RUN apk add --no-cache certbot certbot-nginx

# # Create directory for certbot
# RUN mkdir -p /etc/letsencrypt

# # Copy Nginx configuration
# COPY default.conf /etc/nginx/nginx.conf

# # Create directory for logs
# RUN mkdir -p /var/log/nginx

# # Set proper permissions
# RUN chown -R nginx:nginx /var/log/nginx && \
#     chown -R nginx:nginx /etc/nginx && \
#     chown -R nginx:nginx /var/cache/nginx

# # Forward request logs to Docker log collector
# RUN ln -sf /dev/stdout /var/log/nginx/access.log && \
#     ln -sf /dev/stderr /var/log/nginx/error.log

# EXPOSE 80 443

# CMD ["nginx", "-g", "daemon off;"]
