FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install Apache, PHP, MySQL and essential tools
RUN apt-get update && apt-get install -y \
    apache2 \
    php8.3 \
    php8.3-cli \
    php8.3-common \
    php8.3-mysql \
    php8.3-zip \
    php8.3-gd \
    php8.3-mbstring \
    php8.3-curl \
    php8.3-xml \
    php8.3-bcmath \
    libapache2-mod-php8.3 \
    mariadb-server \
    mariadb-client \
    curl \
    wget \
    git \
    vim \
    nano \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install WP-CLI
RUN curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar \
    && chmod +x wp-cli.phar \
    && mv wp-cli.phar /usr/local/bin/wp

# Enable Apache modules
RUN a2enmod rewrite ssl headers expires

# Configure Apache
RUN echo 'ServerName localhost' >> /etc/apache2/apache2.conf

# Create web directory
RUN mkdir -p /var/www/html /data
WORKDIR /var/www/html

# Setup MySQL/MariaDB
RUN service mariadb start && \
    mysql -e "CREATE DATABASE webdb;" && \
    mysql -e "CREATE USER 'webuser'@'localhost' IDENTIFIED BY 'webpassword';" && \
    mysql -e "GRANT ALL PRIVILEGES ON webdb.* TO 'webuser'@'localhost';" && \
    mysql -e "FLUSH PRIVILEGES;"

# Configure PHP
RUN sed -i 's/upload_max_filesize = 2M/upload_max_filesize = 64M/' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/post_max_size = 8M/post_max_size = 64M/' /etc/php/8.3/apache2/php.ini && \
    sed -i 's/memory_limit = 128M/memory_limit = 256M/' /etc/php/8.3/apache2/php.ini

# Startup script
RUN echo '#!/bin/bash\n\
    service mariadb start\n\
    service apache2 start\n\
    # Auto-detect and install WordPress if not present\n\
    if [ ! -f "/var/www/html/wp-config.php" ] && [ -z "$(ls -A /var/www/html)" ]; then\n\
    echo "Installing WordPress..."\n\
    wp core download --allow-root\n\
    wp config create --dbname=webdb --dbuser=webuser --dbpass=webpassword --allow-root\n\
    wp core install --url=localhost --title="Quantum Cloud Site" --admin_user=admin --admin_password=admin123 --admin_email=admin@localhost.local --allow-root\n\
    fi\n\
    tail -f /var/log/apache2/access.log\n\
    ' > /start.sh && chmod +x /start.sh

EXPOSE 80 443

CMD ["/start.sh"]
