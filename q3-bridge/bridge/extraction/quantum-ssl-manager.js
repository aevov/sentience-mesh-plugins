// SSL/TLS Manager for Quantum Cloud Reverse Proxy
// Handles automatic certificate generation and renewal via Let's Encrypt
// For development: self-signed certs, For production: ACME protocol

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');

class QuantumSSLManager {
    constructor(options = {}) {
        this.certDir = options.certDir || path.join(__dirname, '.ssl-certs');
        this.mode = options.mode || 'development'; // 'development' or 'production'
        this.email = options.email || 'admin@quantum.cloud';
        this.ensureCertDir();
    }

    ensureCertDir() {
        if (!fs.existsSync(this.certDir)) {
            fs.mkdirSync(this.certDir, { recursive: true });
        }
    }

    /**
     * Get or create SSL certificate for a domain
     */
    async getCertificate(domain) {
        const certPath = path.join(this.certDir, `${domain}.crt`);
        const keyPath = path.join(this.certDir, `${domain}.key`);

        // Check if cert exists and is valid
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            const cert = fs.readFileSync(certPath, 'utf8');
            if (this.isCertValid(cert)) {
                console.log(`✅ Using existing certificate for ${domain}`);
                return {
                    cert: fs.readFileSync(certPath),
                    key: fs.readFileSync(keyPath)
                };
            }
        }

        // Generate new certificate
        if (this.mode === 'development') {
            return await this.generateSelfSigned(domain);
        } else {
            return await this.generateLetsEncrypt(domain);
        }
    }

    /**
     * Generate self-signed certificate for development
     */
    async generateSelfSigned(domain) {
        console.log(`🔐 Generating self-signed certificate for ${domain}...`);

        const certPath = path.join(this.certDir, `${domain}.crt`);
        const keyPath = path.join(this.certDir, `${domain}.key`);

        return new Promise((resolve, reject) => {
            const command = `openssl req -x509 -newkey rsa:2048 -nodes \
                -keyout "${keyPath}" \
                -out "${certPath}" \
                -days 365 \
                -subj "/C=US/ST=State/L=City/O=Quantum Cloud/CN=${domain}"`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Failed to generate certificate:`, error);
                    reject(error);
                    return;
                }

                console.log(`✅ Self-signed certificate created for ${domain}`);
                resolve({
                    cert: fs.readFileSync(certPath),
                    key: fs.readFileSync(keyPath)
                });
            });
        });
    }

    /**
     * Generate Let's Encrypt certificate (production)
     * Uses certbot with standalone plugin
     */
    async generateLetsEncrypt(domain) {
        console.log(`🔐 Requesting Let's Encrypt certificate for ${domain}...`);

        return new Promise((resolve, reject) => {
            // Check if certbot is installed
            exec('which certbot', (error) => {
                if (error) {
                    console.warn('⚠️  certbot not installed, falling back to self-signed');
                    return this.generateSelfSigned(domain).then(resolve).catch(reject);
                }

                const command = `certbot certonly --standalone \
                    --non-interactive \
                    --agree-tos \
                    --email ${this.email} \
                    -d ${domain} \
                    --cert-path ${this.certDir}`;

                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`❌ Let's Encrypt failed:`, stderr);
                        console.log('⚠️  Falling back to self-signed certificate');
                        return this.generateSelfSigned(domain).then(resolve).catch(reject);
                    }

                    const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
                    const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

                    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                        console.log(`✅ Let's Encrypt certificate obtained for ${domain}`);
                        resolve({
                            cert: fs.readFileSync(certPath),
                            key: fs.readFileSync(keyPath)
                        });
                    } else {
                        console.warn('⚠️  Let\'s Encrypt cert not found, using self-signed');
                        this.generateSelfSigned(domain).then(resolve).catch(reject);
                    }
                });
            });
        });
    }

    /**
     * Check if certificate is still valid
     */
    isCertValid(certPem) {
        try {
            const cert = crypto.X509Certificate ? new crypto.X509Certificate(certPem) : null;
            if (!cert) return false;

            const now = new Date();
            const validTo = new Date(cert.validTo);

            // Renew if less than 30 days remaining
            const daysRemaining = (validTo - now) / (1000 * 60 * 60 * 24);
            return daysRemaining > 30;
        } catch (e) {
            return false;
        }
    }

    /**
     * Renew all certificates
     */
    async renewAll() {
        if (this.mode !== 'production') {
            console.log('ℹ️  Certificate renewal only available in production mode');
            return;
        }

        console.log('🔄 Renewing all certificates...');

        return new Promise((resolve, reject) => {
            exec('certbot renew --quiet', (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Certificate renewal failed:', stderr);
                    reject(error);
                } else {
                    console.log('✅ Certificates renewed successfully');
                    resolve();
                }
            });
        });
    }
}

// Singleton instance
let sslManager = null;

function getSSLManager(options) {
    if (!sslManager) {
        sslManager = new QuantumSSLManager(options);
    }
    return sslManager;
}

module.exports = { QuantumSSLManager, getSSLManager };
