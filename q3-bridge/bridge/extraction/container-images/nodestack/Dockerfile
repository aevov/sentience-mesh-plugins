FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install base packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    ca-certificates \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest yarn pnpm pm2 \
    && rm -rf /var/lib/apt/lists/*

# Install PostgreSQL 16
RUN apt-get update && apt-get install -y \
    postgresql-16 \
    postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Install Nginx
RUN apt-get update && apt-get install -y nginx \
    && rm -rf /var/lib/apt/lists/* \
    && rm /etc/nginx/sites-enabled/default

# Configure Nginx as reverse proxy
RUN echo 'server {\n\
    listen 80;\n\
    server_name _;\n\
    location / {\n\
    proxy_pass http://localhost:3000;\n\
    proxy_http_version 1.1;\n\
    proxy_set_header Upgrade $http_upgrade;\n\
    proxy_set_header Connection "upgrade";\n\
    proxy_set_header Host $host;\n\
    proxy_set_header X-Real-IP $remote_addr;\n\
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
    proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
    }' > /etc/nginx/sites-available/nodejs-app

RUN ln -s /etc/nginx/sites-available/nodejs-app /etc/nginx/sites-enabled/nodejs-app

# Setup PostgreSQL
RUN service postgresql start && \
    su - postgres -c "psql -c \"CREATE USER appuser WITH PASSWORD 'apppassword';\"" && \
    su - postgres -c "psql -c \"CREATE DATABASE appdb OWNER appuser;\"" && \
    su - postgres -c "psql -c \"ALTER USER appuser WITH SUPERUSER;\""

# Create app directory
RUN mkdir -p /app /data
WORKDIR /app

# Startup script
RUN echo '#!/bin/bash\n\
    service postgresql start\n\
    service nginx start\n\
    if [ -f "/app/package.json" ]; then\n\
    npm install\n\
    if [ -f "/app/next.config.js" ] || [ -f "/app/next.config.mjs" ]; then\n\
    npm run build\n\
    pm2 start npm --name "app" -- start\n\
    else\n\
    pm2 start npm --name "app" -- run start || pm2 start index.js\n\
    fi\n\
    fi\n\
    tail -f /dev/null\n\
    ' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
