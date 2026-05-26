FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# CyberPanel requires Ubuntu 22.04 (not 24.04)
# Install prerequisites
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    sudo \
    systemd \
    systemd-sysv \
    && rm -rf /var/lib/apt/lists/*

# Download and run CyberPanel installer
# Note: This is a non-interactive installation
RUN wget -O installer.sh https://cyberpanel.net/install.sh && \
    chmod +x installer.sh

# Create installation script with auto-answers
RUN echo '#!/bin/bash\n\
    # Auto-install CyberPanel with OpenLiteSpeed\n\
    echo "1" | ./installer.sh || true\n\
    ' > /install-cyberpanel.sh && chmod +x /install-cyberpanel.sh

# Setup startup script
RUN echo '#!/bin/bash\n\
    # Start systemd services\n\
    if [ ! -f /var/cyberpanel/.installed ]; then\n\
    echo "Installing CyberPanel (this may take 10-15 minutes)..."\n\
    /install-cyberpanel.sh\n\
    touch /var/cyberpanel/.installed\n\
    fi\n\
    \n\
    # Start CyberPanel services\n\
    systemctl start lscpd\n\
    systemctl start lsws\n\
    \n\
    echo ""\n\
    echo "═══════════════════════════════════════════════════════"\n\
    echo "  CyberPanel is ready!"\n\
    echo "═══════════════════════════════════════════════════════"\n\
    echo "  Web Panel: http://YOUR_IP:8090"\n\
    echo "  Username: admin"\n\
    echo "  Password: Check /root/.litespeed_password"\n\
    echo "═══════════════════════════════════════════════════════"\n\
    echo ""\n\
    \n\
    tail -f /usr/local/lsws/logs/error.log\n\
    ' > /start.sh && chmod +x /start.sh

EXPOSE 8090 80 443 21 22

# Use systemd as init
CMD ["/start.sh"]
