// Quantum Cloud - Reverse Proxy Manager
// Handles dynamic routing for droplets using QUIC.cloud domains
// Single IP + SNI-based routing with automatic SSL

const express = require('express');
const httpProxy = require('http-proxy');
const { getDomainManager } = require('./quic-domain-manager');

class QuantumReverseProxy {
    constructor() {
        this.proxy = httpProxy.createProxyServer({});
        this.routes = new Map(); // subdomain => {target, dropletId}
        this.domainManager = getDomainManager();
        this.baseDomain = this.getBaseDomain();
    }

    /**
     * Get the configured QUIC.cloud domain to use as base
     */
    getBaseDomain() {
        const config = require('./quantumcloud-edge-config');

        // Use q3BaseDomain from config (convobuilder.com)
        if (config.quicCloud.q3BaseDomain) {
            return config.quicCloud.q3BaseDomain;
        }

        // Fallback: use first domain's hostname
        const domains = this.domainManager.domains;
        if (domains.length > 0) {
            const activeDomain = domains.find(d => d.active) || domains[0];
            if (activeDomain.hostname) {
                return activeDomain.hostname;
            }
        }

        return 'quantum.cloud';
    }

    /**
     * Register a droplet with the reverse proxy
     * @param {string} dropletId - Unique droplet identifier
     * @param {number} port - Internal port the droplet listens on
     * @returns {string} Public URL for the droplet
     */
    registerDroplet(dropletId, port) {
        const subdomain = this.generateSubdomain(dropletId);
        const target = `http://localhost:${port}`;

        this.routes.set(subdomain, {
            target,
            dropletId,
            port,
            createdAt: Date.now()
        });

        console.log(`📍 Registered: ${subdomain}.${this.baseDomain} → ${target}`);

        return `https://${subdomain}.${this.baseDomain}`;
    }

    /**
     * Unregister a droplet from the proxy
     */
    unregisterDroplet(dropletId) {
        for (const [subdomain, route] of this.routes.entries()) {
            if (route.dropletId === dropletId) {
                this.routes.delete(subdomain);
                console.log(`🗑️  Unregistered: ${subdomain}.${this.baseDomain}`);
                return true;
            }
        }
        return false;
    }

    /**
     * Generate subdomain from droplet ID
     * Format: droplet-abc123
     */
    generateSubdomain(dropletId) {
        return `droplet-${dropletId}`;
    }

    /**
     * Get route for a given hostname
     */
    getRoute(hostname) {
        // Extract subdomain from hostname
        const subdomain = hostname.split('.')[0];
        return this.routes.get(subdomain);
    }

    /**
     * Create Express middleware for the reverse proxy
     */
    middleware() {
        return (req, res, next) => {
            const hostname = req.hostname || req.headers.host?.split(':')[0];
            const route = this.getRoute(hostname);

            if (!route) {
                // Not a droplet route, pass through
                return next();
            }

            // Proxy to the droplet
            console.log(`🔀 Proxying: ${hostname} → ${route.target}${req.url}`);

            this.proxy.web(req, res, {
                target: route.target,
                changeOrigin: true,
                ws: true, // WebSocket support
            }, (err) => {
                console.error(`❌ Proxy error for ${hostname}:`, err.message);
                res.status(502).json({
                    error: 'Bad Gateway',
                    message: 'Droplet unreachable',
                    dropletId: route.dropletId
                });
            });
        };
    }

    /**
     * Handle WebSocket upgrade
     */
    handleUpgrade(req, socket, head) {
        const hostname = req.headers.host?.split(':')[0];
        const route = this.getRoute(hostname);

        if (route) {
            console.log(`🔌 WebSocket upgrade: ${hostname} → ${route.target}`);
            this.proxy.ws(req, socket, head, { target: route.target });
        } else {
            socket.destroy();
        }
    }

    /**
     * Get all registered routes
     */
    getRoutes() {
        const routes = [];
        for (const [subdomain, route] of this.routes.entries()) {
            routes.push({
                subdomain,
                url: `https://${subdomain}.${this.baseDomain}`,
                dropletId: route.dropletId,
                target: route.target,
                createdAt: route.createdAt
            });
        }
        return routes;
    }
}

// Singleton instance
let proxyInstance = null;

function getProxyManager() {
    if (!proxyInstance) {
        proxyInstance = new QuantumReverseProxy();
    }
    return proxyInstance;
}

module.exports = { QuantumReverseProxy, getProxyManager };
