FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install ALL essential system packages
RUN apt-get update && apt-get install -y \
    # Core system utilities
    sudo \
    apt-utils \
    software-properties-common \
    ca-certificates \
    # Network tools
    curl \
    wget \
    iputils-ping \
    net-tools \
    dnsutils \
    netcat-openbsd \
    # Text editors
    vim \
    nano \
    # Version control
    git \
    # Compression
    zip \
    unzip \
    tar \
    gzip \
    bzip2 \
    # System monitoring
    htop \
    tree \
    # File utilities
    less \
    # Build essentials (common need)
    build-essential \
    gcc \
    g++ \
    make \
    # SSL/TLS
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Create sudo user (ubuntu user already exists in base image, so just configure it)
RUN echo "ubuntu:ubuntu" | chpasswd 2>/dev/null || true && \
    usermod -aG sudo ubuntu 2>/dev/null || true && \
    echo "ubuntu ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up proper PATH
ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# Create workspace
RUN mkdir -p /workspace /data
WORKDIR /workspace

# Keep container running
CMD ["tail", "-f", "/dev/null"]
