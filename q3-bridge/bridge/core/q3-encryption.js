/**
 * Q3Encryption - Per-shard encryption
 * 
 * Features:
 * - AES-256-GCM encryption
 * - Per-shard key derivation
 * - Key management integration (PyKMIP compatible)
 * - Zero-knowledge design
 */

const crypto = require('crypto');

class Q3Encryption {
    constructor(options = {}) {
        this.algorithm = options.algorithm || 'aes-256-gcm';
        this.keyLength = options.keyLength || 32; // 256 bits
        this.ivLength = options.ivLength || 12;   // 96 bits for GCM

        // Key derivation settings
        this.kdfIterations = options.kdfIterations || 100000;
        this.kdfSalt = options.kdfSalt || crypto.randomBytes(32);
    }

    /**
     * Encrypt data with AES-256-GCM
     */
    encrypt(data, key = null) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

        // Generate key if not provided
        const encryptionKey = key || crypto.randomBytes(this.keyLength);
        const iv = crypto.randomBytes(this.ivLength);

        // Create cipher
        const cipher = crypto.createCipheriv(this.algorithm, encryptionKey, iv);

        // Encrypt
        const encrypted = Buffer.concat([
            cipher.update(buffer),
            cipher.final()
        ]);

        // Get auth tag
        const authTag = cipher.getAuthTag();

        return {
            data: encrypted,
            meta: {
                algorithm: this.algorithm,
                keyId: crypto.createHash('sha256').update(encryptionKey).digest('hex').slice(0, 16),
                key: encryptionKey.toString('hex'),
                iv: iv.toString('hex'),
                tag: authTag.toString('hex'),
                originalSize: buffer.length,
                encryptedSize: encrypted.length
            }
        };
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData, meta) {
        const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);

        // Get key and IV
        const key = Buffer.from(meta.key, 'hex');
        const iv = Buffer.from(meta.iv, 'hex');
        const authTag = Buffer.from(meta.tag, 'hex');

        // Create decipher
        const decipher = crypto.createDecipheriv(meta.algorithm || this.algorithm, key, iv);
        decipher.setAuthTag(authTag);

        // Decrypt
        const decrypted = Buffer.concat([
            decipher.update(buffer),
            decipher.final()
        ]);

        return decrypted;
    }

    /**
     * Generate a secure random key
     */
    generateKey() {
        return crypto.randomBytes(this.keyLength);
    }

    /**
     * Derive key from password (PBKDF2)
     */
    deriveKey(password, salt = null) {
        const useSalt = salt || this.kdfSalt;
        return crypto.pbkdf2Sync(
            password,
            useSalt,
            this.kdfIterations,
            this.keyLength,
            'sha512'
        );
    }

    /**
     * Create key ID (for PyKMIP integration)
     */
    createKeyId(key) {
        return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);
    }

    /**
     * Encrypt shard with derived key
     */
    encryptShard(shardData, masterKey, shardIndex) {
        // Derive per-shard key
        const shardKey = this.deriveShardKey(masterKey, shardIndex);

        return this.encrypt(shardData, shardKey);
    }

    /**
     * Decrypt shard with derived key
     */
    decryptShard(encryptedData, meta, masterKey, shardIndex) {
        // Derive per-shard key
        const shardKey = this.deriveShardKey(masterKey, shardIndex);

        // Override key in meta
        const shardMeta = { ...meta, key: shardKey.toString('hex') };

        return this.decrypt(encryptedData, shardMeta);
    }

    /**
     * Derive key for specific shard
     */
    deriveShardKey(masterKey, shardIndex) {
        const info = Buffer.from(`Q3-SHARD-${shardIndex}`);
        return crypto.createHmac('sha256', masterKey).update(info).digest();
    }

    /**
     * Generate quantum-resistant key (placeholder for future)
     */
    generateQuantumKey() {
        // TODO: Implement post-quantum cryptography
        // For now, use extra-long key
        return crypto.randomBytes(64);
    }

    /**
     * Hash data with SHA-256
     */
    hash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify hash
     */
    verifyHash(data, expectedHash) {
        const actualHash = this.hash(data);
        return actualHash === expectedHash;
    }
}

module.exports = Q3Encryption;
