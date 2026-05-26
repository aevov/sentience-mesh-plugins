/**
 * QBlob Protocol SDK
 * 
 * Domain-agnostic, content-addressable, offline-first file protocol.
 * 
 * Features:
 * - Content-addressed URLs (same file = same URL)
 * - Multi-source resolution (cache → LAN → orbitals)
 * - Offline-first with IndexedDB + Service Worker
 * - S3-style ACLs (public, signed, encrypted)
 * - LAN peer discovery and sharing
 * - Shareable external links
 * 
 * URL Format:
 *   qblob://Qm8f3k9x2Yz7a1BcDe4F5gH6jK7mN8pQ9rS/filename.ext
 *   web+qblob://Qm8f3k9x2Yz7a1B/file (browser-compatible)
 * 
 * @author cr8OS Project
 * @version 1.0.0
 */

(function (global) {
    'use strict';

    // ==========================================================================
    // CONSTANTS
    // ==========================================================================

    const VERSION = '1.0.0';
    const PROTOCOL = 'qblob://';
    const WEB_PROTOCOL = 'web+qblob://';
    const DB_NAME = 'qblob-store';
    const DB_VERSION = 1;
    const CONTENT_ID_LENGTH = 32;

    // Base58 alphabet (same as IPFS)
    const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

    // ==========================================================================
    // UTILITIES
    // ==========================================================================

    /**
     * Encode bytes to Base58
     */
    function base58Encode(bytes) {
        const digits = [0];

        for (const byte of bytes) {
            let carry = byte;
            for (let i = 0; i < digits.length; i++) {
                carry += digits[i] << 8;
                digits[i] = carry % 58;
                carry = (carry / 58) | 0;
            }
            while (carry) {
                digits.push(carry % 58);
                carry = (carry / 58) | 0;
            }
        }

        let result = '';
        for (let i = digits.length - 1; i >= 0; i--) {
            result += BASE58_ALPHABET[digits[i]];
        }

        // Add leading '1's for leading zero bytes
        for (const byte of bytes) {
            if (byte === 0) result = '1' + result;
            else break;
        }

        return result;
    }

    /**
     * Decode Base58 to bytes
     */
    function base58Decode(str) {
        const bytes = [0];

        for (const char of str) {
            let carry = BASE58_ALPHABET.indexOf(char);
            if (carry < 0) throw new Error('Invalid Base58 character');

            for (let i = 0; i < bytes.length; i++) {
                carry += bytes[i] * 58;
                bytes[i] = carry & 0xff;
                carry >>= 8;
            }
            while (carry) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }
        }

        // Add leading zeros
        for (const char of str) {
            if (char === '1') bytes.push(0);
            else break;
        }

        return new Uint8Array(bytes.reverse());
    }

    /**
     * Array buffer to hex
     */
    function bufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Hex to array buffer
     */
    function hexToBuffer(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    // ==========================================================================
    // CONTENT ID
    // ==========================================================================

    /**
     * Generate content ID from data
     */
    async function generateContentId(data) {
        // Convert to ArrayBuffer if needed
        let buffer;
        if (data instanceof ArrayBuffer) {
            buffer = data;
        } else if (data instanceof Blob) {
            buffer = await data.arrayBuffer();
        } else if (typeof data === 'string') {
            buffer = new TextEncoder().encode(data).buffer;
        } else if (data.buffer instanceof ArrayBuffer) {
            buffer = data.buffer;
        } else {
            throw new Error('Unsupported data type');
        }

        // SHA-256 hash
        const hash = await crypto.subtle.digest('SHA-256', buffer);

        // Version prefix (0x01 = v1)
        const versioned = new Uint8Array([0x01, ...new Uint8Array(hash)]);

        // Base58 encode
        const encoded = base58Encode(versioned);

        // Prefix with 'Qm' and truncate to 32 chars
        return 'Qm' + encoded.substring(0, CONTENT_ID_LENGTH - 2);
    }

    /**
     * Verify content matches ID
     */
    async function verifyContentId(contentId, data) {
        const computed = await generateContentId(data);
        return computed === contentId;
    }

    // ==========================================================================
    // URL PARSING
    // ==========================================================================

    /**
     * Parse QBlob URL
     */
    function parseQBlobUrl(url) {
        // Remove protocol
        let path = url.replace(/^(web\+)?qblob:\/\//, '');

        // Parse security prefix
        let security = 'public';
        let securityData = null;

        if (path.includes('@')) {
            const [secPart, rest] = path.split('@');
            path = rest;

            if (secPart.startsWith('signed:')) {
                security = 'signed';
                securityData = secPart.substring(7);
            } else if (secPart.startsWith('encrypted:')) {
                security = 'encrypted';
                securityData = secPart.substring(10);
            } else if (secPart === 'public') {
                security = 'public';
            } else if (secPart === 'private') {
                security = 'private';
            }
        }

        // Parse content ID and filename
        const [contentId, ...pathParts] = path.split('/');
        const filename = pathParts.join('/').split('?')[0] || null;

        // Parse query params
        const params = {};
        const queryIndex = path.indexOf('?');
        if (queryIndex !== -1) {
            const query = path.substring(queryIndex + 1);
            for (const pair of query.split('&')) {
                const [key, value] = pair.split('=');
                params[key] = decodeURIComponent(value || '');
            }
        }

        return {
            contentId,
            filename,
            security,
            securityData,
            params,
            expires: params.expires ? parseInt(params.expires) : null
        };
    }

    /**
     * Build QBlob URL
     */
    function buildQBlobUrl(contentId, options = {}) {
        let url = options.webCompatible ? WEB_PROTOCOL : PROTOCOL;

        // Security prefix
        if (options.signed && options.signature) {
            url += `signed:${options.signature}@`;
        } else if (options.encrypted && options.iv) {
            url += `encrypted:${options.iv}@`;
        }

        url += contentId;

        if (options.filename) {
            url += '/' + encodeURIComponent(options.filename);
        }

        // Query params
        const params = [];
        if (options.expires) {
            params.push(`expires=${options.expires}`);
        }
        if (options.stream) {
            params.push('stream=true');
        }
        if (params.length > 0) {
            url += '?' + params.join('&');
        }

        return url;
    }

    // ==========================================================================
    // INDEXEDDB CACHE
    // ==========================================================================

    class QBlobCache {
        constructor() {
            this.db = null;
            this.ready = this.init();
        }

        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);

                request.onerror = () => reject(request.error);

                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;

                    // Blobs store
                    if (!db.objectStoreNames.contains('blobs')) {
                        db.createObjectStore('blobs', { keyPath: 'contentId' });
                    }

                    // Metadata store
                    if (!db.objectStoreNames.contains('meta')) {
                        const metaStore = db.createObjectStore('meta', { keyPath: 'contentId' });
                        metaStore.createIndex('filename', 'filename', { unique: false });
                        metaStore.createIndex('cached', 'cached', { unique: false });
                    }
                };
            });
        }

        async get(contentId) {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('blobs', 'readonly');
                const store = tx.objectStore('blobs');
                const request = store.get(contentId);
                request.onsuccess = () => resolve(request.result?.data);
                request.onerror = () => reject(request.error);
            });
        }

        async set(contentId, data, meta = {}) {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['blobs', 'meta'], 'readwrite');

                tx.objectStore('blobs').put({ contentId, data });
                tx.objectStore('meta').put({
                    contentId,
                    filename: meta.filename || null,
                    mimeType: meta.mimeType || 'application/octet-stream',
                    size: data.byteLength || data.size || 0,
                    cached: Date.now(),
                    ...meta
                });

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        async getMeta(contentId) {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('meta', 'readonly');
                const request = tx.objectStore('meta').get(contentId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async has(contentId) {
            const meta = await this.getMeta(contentId);
            return !!meta;
        }

        async delete(contentId) {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['blobs', 'meta'], 'readwrite');
                tx.objectStore('blobs').delete(contentId);
                tx.objectStore('meta').delete(contentId);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        async list() {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('meta', 'readonly');
                const request = tx.objectStore('meta').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }

        async clear() {
            await this.ready;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(['blobs', 'meta'], 'readwrite');
                tx.objectStore('blobs').clear();
                tx.objectStore('meta').clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        async getSize() {
            const items = await this.list();
            return items.reduce((sum, item) => sum + (item.size || 0), 0);
        }
    }

    // ==========================================================================
    // LAN DISCOVERY
    // ==========================================================================

    class LANDiscovery {
        constructor(options = {}) {
            this.enabled = options.enabled !== false;
            this.port = options.port || 9876;
            this.peers = new Map();
            this.server = null;
            this.announceInterval = null;
            this.onPeerFound = options.onPeerFound || (() => { });
        }

        async start() {
            if (!this.enabled) return;

            // Start WebSocket server for peer communication
            if (typeof WebSocket !== 'undefined') {
                this.startAnnouncing();
                this.startListening();
            }
        }

        startAnnouncing() {
            // Announce presence every 30 seconds
            this.announceInterval = setInterval(() => {
                this.announce();
            }, 30000);

            this.announce();
        }

        async announce() {
            // Broadcast presence via UDP multicast or local storage coordination
            const announcement = {
                type: 'qblob-peer',
                id: this.peerId,
                timestamp: Date.now()
            };

            // Use BroadcastChannel for same-origin tabs
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('qblob-lan');
                channel.postMessage(announcement);
                channel.close();
            }
        }

        startListening() {
            if (typeof BroadcastChannel !== 'undefined') {
                const channel = new BroadcastChannel('qblob-lan');
                channel.onmessage = (event) => {
                    if (event.data.type === 'qblob-peer') {
                        this.addPeer(event.data);
                    } else if (event.data.type === 'qblob-request') {
                        this.handleRequest(event.data);
                    }
                };
            }
        }

        addPeer(peer) {
            if (peer.id !== this.peerId) {
                this.peers.set(peer.id, {
                    ...peer,
                    lastSeen: Date.now()
                });
                this.onPeerFound(peer);
            }
        }

        async requestFromPeers(contentId) {
            return new Promise((resolve) => {
                const channel = new BroadcastChannel('qblob-lan');

                const timeout = setTimeout(() => {
                    channel.close();
                    resolve(null);
                }, 5000);

                channel.onmessage = (event) => {
                    if (event.data.type === 'qblob-response' &&
                        event.data.contentId === contentId) {
                        clearTimeout(timeout);
                        channel.close();
                        resolve(event.data.data);
                    }
                };

                channel.postMessage({
                    type: 'qblob-request',
                    contentId,
                    requesterId: this.peerId
                });
            });
        }

        async handleRequest(request) {
            if (request.requesterId === this.peerId) return;

            const cache = new QBlobCache();
            const data = await cache.get(request.contentId);

            if (data) {
                const channel = new BroadcastChannel('qblob-lan');
                channel.postMessage({
                    type: 'qblob-response',
                    contentId: request.contentId,
                    data: data
                });
                channel.close();
            }
        }

        stop() {
            if (this.announceInterval) {
                clearInterval(this.announceInterval);
            }
        }

        get peerId() {
            let id = localStorage.getItem('qblob-peer-id');
            if (!id) {
                id = 'peer-' + Math.random().toString(36).substring(2, 15);
                localStorage.setItem('qblob-peer-id', id);
            }
            return id;
        }
    }

    // ==========================================================================
    // SECURITY
    // ==========================================================================

    class QBlobSecurity {
        constructor(apiKey) {
            this.apiKey = apiKey;
        }

        /**
         * Create signed URL
         */
        async sign(contentId, options = {}) {
            const expires = options.expires || Date.now() + 3600000; // 1 hour default
            const payload = `${contentId}:${expires}`;

            // HMAC-SHA256
            const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(this.apiKey),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );

            const signature = await crypto.subtle.sign(
                'HMAC',
                key,
                new TextEncoder().encode(payload)
            );

            const sig = base58Encode(new Uint8Array(signature)).substring(0, 16);

            return {
                signature: sig,
                expires,
                url: buildQBlobUrl(contentId, {
                    signed: true,
                    signature: sig,
                    expires,
                    filename: options.filename
                })
            };
        }

        /**
         * Verify signed URL
         */
        async verify(qblobUrl) {
            const parsed = parseQBlobUrl(qblobUrl);

            if (parsed.security !== 'signed') {
                return { valid: false, reason: 'NOT_SIGNED' };
            }

            if (parsed.expires && Date.now() > parsed.expires) {
                return { valid: false, reason: 'EXPIRED' };
            }

            const expected = await this.sign(parsed.contentId, {
                expires: parsed.expires
            });

            return {
                valid: expected.signature === parsed.securityData,
                reason: expected.signature === parsed.securityData ? null : 'INVALID_SIGNATURE'
            };
        }

        /**
         * Encrypt data
         */
        async encrypt(data, password) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Derive key from password
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt']
            );

            // Encrypt
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                data
            );

            // Combine salt + iv + ciphertext
            const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(encrypted), salt.length + iv.length);

            return combined.buffer;
        }

        /**
         * Decrypt data
         */
        async decrypt(encryptedData, password) {
            const data = new Uint8Array(encryptedData);
            const salt = data.slice(0, 16);
            const iv = data.slice(16, 28);
            const ciphertext = data.slice(28);

            // Derive key
            const keyMaterial = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(password),
                'PBKDF2',
                false,
                ['deriveBits', 'deriveKey']
            );

            const key = await crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            // Decrypt
            return await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );
        }
    }

    // ==========================================================================
    // MAIN QBLOB CLASS
    // ==========================================================================

    class QBlob {
        constructor(options = {}) {
            this.config = {
                orbitals: options.orbitals || [],
                fallbackUrl: options.fallbackUrl || null,
                cacheSize: options.cacheSize || 500 * 1024 * 1024, // 500MB
                lanDiscovery: options.lanDiscovery !== false,
                webCompatible: options.webCompatible !== false,
                apiKey: options.apiKey || this.generateApiKey()
            };

            this.cache = new QBlobCache();
            this.security = new QBlobSecurity(this.config.apiKey);
            this.lan = new LANDiscovery({
                enabled: this.config.lanDiscovery,
                onPeerFound: (peer) => this.onPeerFound(peer)
            });

            this.stats = {
                cacheHits: 0,
                cacheMisses: 0,
                lanHits: 0,
                orbitalHits: 0,
                uploads: 0,
                downloads: 0
            };

            // Start LAN discovery
            if (this.config.lanDiscovery) {
                this.lan.start();
            }

            // Register protocol handler
            this.registerProtocolHandler();
        }

        generateApiKey() {
            const array = new Uint8Array(32);
            crypto.getRandomValues(array);
            return 'qblob_' + base58Encode(array).substring(0, 32);
        }

        registerProtocolHandler() {
            if (typeof navigator !== 'undefined' && navigator.registerProtocolHandler) {
                try {
                    navigator.registerProtocolHandler(
                        'web+qblob',
                        location.origin + '/qblob-handler?url=%s',
                        'QBlob File Handler'
                    );
                } catch (e) {
                    // Protocol registration may not be available
                }
            }
        }

        onPeerFound(peer) {
            console.log('🔗 QBlob peer found:', peer.id);
        }

        // ======================================================================
        // UPLOAD
        // ======================================================================

        /**
         * Upload data and get QBlob URL
         */
        async upload(data, options = {}) {
            // Get data as ArrayBuffer
            let buffer;
            let filename = options.filename || options.name;
            let mimeType = options.mimeType || options.type;

            if (data instanceof File) {
                buffer = await data.arrayBuffer();
                filename = filename || data.name;
                mimeType = mimeType || data.type;
            } else if (data instanceof Blob) {
                buffer = await data.arrayBuffer();
                mimeType = mimeType || data.type;
            } else if (data instanceof ArrayBuffer) {
                buffer = data;
            } else if (typeof data === 'string') {
                buffer = new TextEncoder().encode(data).buffer;
                mimeType = mimeType || 'text/plain';
            } else {
                throw new Error('Unsupported data type');
            }

            // Encrypt if requested
            if (options.encrypt && options.password) {
                buffer = await this.security.encrypt(buffer, options.password);
            }

            // Generate content ID
            const contentId = await generateContentId(buffer);

            // Cache locally
            await this.cache.set(contentId, buffer, {
                filename,
                mimeType,
                acl: options.acl || 'public',
                encrypted: !!options.encrypt
            });

            // Upload to orbitals if configured
            if (this.config.orbitals.length > 0) {
                await this.uploadToOrbitals(contentId, buffer, { filename, mimeType });
            }

            this.stats.uploads++;

            // Build URL
            return buildQBlobUrl(contentId, {
                filename,
                webCompatible: this.config.webCompatible,
                encrypted: options.encrypt
            });
        }

        async uploadToOrbitals(contentId, data, meta) {
            const formData = new FormData();
            formData.append('contentId', contentId);
            formData.append('data', new Blob([data]));
            formData.append('meta', JSON.stringify(meta));

            for (const orbital of this.config.orbitals) {
                try {
                    await fetch(`https://${orbital}/qblob/upload`, {
                        method: 'POST',
                        headers: {
                            'X-QBlob-Key': this.config.apiKey
                        },
                        body: formData
                    });
                } catch (e) {
                    console.warn(`Failed to upload to ${orbital}:`, e);
                }
            }
        }

        // ======================================================================
        // DOWNLOAD
        // ======================================================================

        /**
         * Download from QBlob URL
         */
        async download(qblobUrl, options = {}) {
            const parsed = parseQBlobUrl(qblobUrl);

            // Verify signed URL if applicable
            if (parsed.security === 'signed') {
                const verified = await this.security.verify(qblobUrl);
                if (!verified.valid) {
                    throw new Error(`Signature verification failed: ${verified.reason}`);
                }
            }

            // Resolve content
            const result = await this.resolve(parsed.contentId, options);

            if (!result.data) {
                throw new Error('Content not found');
            }

            // Decrypt if encrypted
            if (parsed.security === 'encrypted' && options.password) {
                result.data = await this.security.decrypt(result.data, options.password);
            }

            this.stats.downloads++;

            // Return as Blob
            const meta = await this.cache.getMeta(parsed.contentId);
            return new Blob([result.data], {
                type: meta?.mimeType || 'application/octet-stream'
            });
        }

        /**
         * Resolve content from any source
         */
        async resolve(contentId, options = {}) {
            const onProgress = options.onProgress || (() => { });

            // 1. Check local cache
            onProgress({ stage: 'cache', progress: 0 });
            const cached = await this.cache.get(contentId);
            if (cached) {
                this.stats.cacheHits++;
                return { source: 'cache', data: cached };
            }
            this.stats.cacheMisses++;

            // 2. Check LAN peers
            if (this.config.lanDiscovery) {
                onProgress({ stage: 'lan', progress: 25 });
                const lanData = await this.lan.requestFromPeers(contentId);
                if (lanData) {
                    this.stats.lanHits++;
                    // Cache it
                    await this.cache.set(contentId, lanData);
                    return { source: 'lan', data: lanData };
                }
            }

            // 3. Fetch from orbitals
            onProgress({ stage: 'orbital', progress: 50 });
            for (const orbital of this.config.orbitals) {
                try {
                    const response = await fetch(`https://${orbital}/qblob/${contentId}`, {
                        headers: {
                            'X-QBlob-Key': this.config.apiKey
                        }
                    });

                    if (response.ok) {
                        const data = await response.arrayBuffer();

                        // Verify content hash
                        const verified = await verifyContentId(contentId, data);
                        if (verified) {
                            this.stats.orbitalHits++;
                            // Cache it
                            await this.cache.set(contentId, data);
                            onProgress({ stage: 'complete', progress: 100 });
                            return { source: 'orbital', data };
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            // 4. Try fallback URL
            if (this.config.fallbackUrl) {
                try {
                    const response = await fetch(`${this.config.fallbackUrl}/${contentId}`);
                    if (response.ok) {
                        const data = await response.arrayBuffer();
                        await this.cache.set(contentId, data);
                        return { source: 'fallback', data };
                    }
                } catch (e) { }
            }

            onProgress({ stage: 'failed', progress: 0 });
            return { source: null, data: null };
        }

        // ======================================================================
        // EXISTENCE CHECK
        // ======================================================================

        /**
         * Check if content exists
         */
        async exists(qblobUrl) {
            const parsed = parseQBlobUrl(qblobUrl);

            const status = {
                exists: false,
                sources: [],
                lastSeen: null,
                confidence: 0
            };

            // Check cache
            if (await this.cache.has(parsed.contentId)) {
                status.exists = true;
                status.sources.push('cache');
                status.confidence += 0.3;
                const meta = await this.cache.getMeta(parsed.contentId);
                status.lastSeen = meta?.cached;
            }

            // Check orbitals (parallel)
            const orbitalChecks = this.config.orbitals.map(async (orbital) => {
                try {
                    const response = await fetch(`https://${orbital}/qblob/${parsed.contentId}/exists`, {
                        method: 'HEAD',
                        headers: { 'X-QBlob-Key': this.config.apiKey }
                    });
                    return { orbital, exists: response.ok };
                } catch (e) {
                    return { orbital, exists: false };
                }
            });

            const results = await Promise.all(orbitalChecks);
            for (const result of results) {
                if (result.exists) {
                    status.exists = true;
                    status.sources.push(result.orbital);
                    status.confidence += 0.2;
                }
            }

            status.confidence = Math.min(1, status.confidence);

            return status;
        }

        // ======================================================================
        // SIGNING & SHARING
        // ======================================================================

        /**
         * Create signed shareable URL
         */
        async sign(qblobUrl, options = {}) {
            const parsed = parseQBlobUrl(qblobUrl);

            let expires;
            if (typeof options.expires === 'string') {
                const match = options.expires.match(/^(\d+)(h|d|m|s)?$/);
                if (match) {
                    const value = parseInt(match[1]);
                    const unit = match[2] || 'h';
                    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
                    expires = Date.now() + value * multipliers[unit];
                }
            } else {
                expires = options.expires || Date.now() + 3600000;
            }

            return await this.security.sign(parsed.contentId, {
                expires,
                filename: parsed.filename
            });
        }

        /**
         * Create encrypted URL
         */
        async encrypt(qblobUrl, password) {
            const parsed = parseQBlobUrl(qblobUrl);
            const data = await this.cache.get(parsed.contentId);

            if (!data) {
                throw new Error('Content not in cache');
            }

            const encrypted = await this.security.encrypt(data, password);
            const encryptedId = await generateContentId(encrypted);

            await this.cache.set(encryptedId, encrypted, {
                originalId: parsed.contentId,
                encrypted: true
            });

            return buildQBlobUrl(encryptedId, {
                encrypted: true,
                iv: bufferToHex(encrypted.slice(16, 28)),
                filename: parsed.filename ? parsed.filename + '.enc' : null
            });
        }

        // ======================================================================
        // CACHE MANAGEMENT
        // ======================================================================

        /**
         * List cached items
         */
        async listCached() {
            return await this.cache.list();
        }

        /**
         * Clear cache
         */
        async clearCache() {
            return await this.cache.clear();
        }

        /**
         * Get cache size
         */
        async getCacheSize() {
            return await this.cache.getSize();
        }

        /**
         * Delete from cache
         */
        async delete(qblobUrl) {
            const parsed = parseQBlobUrl(qblobUrl);
            return await this.cache.delete(parsed.contentId);
        }

        // ======================================================================
        // STREAMING
        // ======================================================================

        /**
         * Stream large files
         */
        async stream(qblobUrl, options = {}) {
            const parsed = parseQBlobUrl(qblobUrl);
            const onProgress = options.onProgress || (() => { });

            // Try to get from orbital with streaming
            for (const orbital of this.config.orbitals) {
                try {
                    const response = await fetch(`https://${orbital}/qblob/${parsed.contentId}`, {
                        headers: { 'X-QBlob-Key': this.config.apiKey }
                    });

                    if (!response.ok) continue;

                    const reader = response.body.getReader();
                    const total = parseInt(response.headers.get('content-length') || '0');
                    let received = 0;
                    const chunks = [];

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        chunks.push(value);
                        received += value.length;
                        onProgress({
                            received,
                            total,
                            percent: total ? (received / total) * 100 : 0
                        });
                    }

                    const data = new Uint8Array(received);
                    let offset = 0;
                    for (const chunk of chunks) {
                        data.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Cache it
                    await this.cache.set(parsed.contentId, data.buffer);

                    return new Blob([data]);
                } catch (e) {
                    continue;
                }
            }

            throw new Error('Streaming failed');
        }

        // ======================================================================
        // UTILITIES
        // ======================================================================

        /**
         * Create object URL from qblob (for <img>, <video>, etc)
         */
        async toObjectUrl(qblobUrl) {
            const blob = await this.download(qblobUrl);
            return URL.createObjectURL(blob);
        }

        /**
         * Convert qblob URL to HTTP URL (for external sharing)
         */
        toHttpUrl(qblobUrl) {
            const parsed = parseQBlobUrl(qblobUrl);

            if (this.config.fallbackUrl) {
                return `${this.config.fallbackUrl}/${parsed.contentId}/${parsed.filename || ''}`;
            }

            if (this.config.orbitals.length > 0) {
                return `https://${this.config.orbitals[0]}/qblob/${parsed.contentId}/${parsed.filename || ''}`;
            }

            throw new Error('No HTTP fallback configured');
        }

        /**
         * Get stats
         */
        getStats() {
            return { ...this.stats };
        }

        /**
         * Parse URL
         */
        static parse(url) {
            return parseQBlobUrl(url);
        }

        /**
         * Generate content ID
         */
        static async generateId(data) {
            return await generateContentId(data);
        }
    }

    // ==========================================================================
    // EXPORTS
    // ==========================================================================

    QBlob.VERSION = VERSION;
    QBlob.PROTOCOL = PROTOCOL;
    QBlob.WEB_PROTOCOL = WEB_PROTOCOL;

    // Export for different environments
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = QBlob;
    } else if (typeof define === 'function' && define.amd) {
        define([], function () { return QBlob; });
    } else {
        global.QBlob = QBlob;
    }

})(typeof window !== 'undefined' ? window : global);
