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
    uidmap \
    fuse-overlayfs \
    slirp4netns \
    && rm -rf /var/lib/apt/lists/*

# Install Podman (Docker-compatible)
RUN apt-get update && apt-get install -y podman \
    && rm -rf /var/lib/apt/lists/*

# Install docker-compose
RUN curl -SL https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose \
    && chmod +x /usr/local/bin/docker-compose

# Create docker alias for podman
RUN echo 'alias docker=podman' >> /root/.bashrc

# Configure Podman for rootless operation
RUN mkdir -p /etc/containers && \
    echo 'unqualified-search-registries = ["docker.io"]' > /etc/containers/registries.conf

# Create workspace
RUN mkdir -p /workspace /data
WORKDIR /workspace

# Startup script
RUN echo '#!/bin/bash\n\
    echo "Docker-compatible environment ready!"\n\
    echo "Use: podman run ... or docker-compose up"\n\
    tail -f /dev/null\n\
    ' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
