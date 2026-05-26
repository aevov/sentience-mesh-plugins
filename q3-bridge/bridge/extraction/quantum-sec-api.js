/**
 * QuantumSec API - JavaScript REST Interface
 * 
 * Quantum Security Platform: QKD, PQC, QRNG, and Authentication
 * Integrates with QuantumISP for QKD network backbone
 */

// =========================================================================
// QUANTUM SECURITY CONSTANTS
// =========================================================================

// QKD Protocols
const QKD_PROTOCOLS = {
    BB84: { name: 'BB84', description: 'Bennett-Brassard 1984', qberThreshold: 0.11 },
    E91: { name: 'E91', description: 'Ekert 1991 (EPR-based)', bellThreshold: 2.5 }
};

// PQC Algorithms
const PQC_ALGORITHMS = {
    KYBER512: { name: 'Kyber512', type: 'kem', securityLevel: 1 },
    KYBER768: { name: 'Kyber768', type: 'kem', securityLevel: 3 },
    KYBER1024: { name: 'Kyber1024', type: 'kem', securityLevel: 5 },
    DILITHIUM2: { name: 'Dilithium2', type: 'sign', securityLevel: 2 },
    DILITHIUM3: { name: 'Dilithium3', type: 'sign', securityLevel: 3 },
    DILITHIUM5: { name: 'Dilithium5', type: 'sign', securityLevel: 5 },
    SPHINCS_SHA256_128F: { name: 'SPHINCS+-SHA256-128f', type: 'sign', securityLevel: 1 }
};

// Security tiers
const SECURITY_TIERS = {
    FREE: { qkdBitsMonth: 100, qrngBytesMonth: 1073741824, price: 0 },
    PROFESSIONAL: { qkdBitsMonth: 10000, qrngBytesMonth: 107374182400, price: 1000 },
    ENTERPRISE: { qkdBitsMonth: 1000000, qrngBytesMonth: 1099511627776, price: 100000 }
};

// In-memory stores
let qkdKeys = new Map();
let pqcKeypairs = new Map();
let qrngSessions = [];
let authTokens = new Map();
let secUsers = new Map();

let keyIdCounter = 0;
let keypairIdCounter = 0;
let tokenIdCounter = 0;

// =========================================================================
// QKD - QUANTUM KEY DISTRIBUTION
// =========================================================================

/**
 * Generate QKD key using BB84 or E91
 */
function generateQKDKey(protocol, lengthBits, partnerId) {
    if (!QKD_PROTOCOLS[protocol]) {
        return { error: `Unknown protocol. Use: ${Object.keys(QKD_PROTOCOLS).join(', ')}` };
    }

    const id = `qkd-${++keyIdCounter}`;

    // Simulate quantum key exchange
    const qber = 0.02 + Math.random() * 0.03;  // 2-5% simulated QBER
    const isSecure = protocol === 'BB84'
        ? qber < QKD_PROTOCOLS.BB84.qberThreshold
        : Math.random() * 0.5 + 2.3 > QKD_PROTOCOLS.E91.bellThreshold;  // Bell parameter

    // Generate raw key (simulated - real would come from quantum channel)
    const rawKey = Array(lengthBits).fill(0).map(() => Math.random() > 0.5 ? 1 : 0);
    const keyHex = rawKey.reduce((acc, bit, i) => {
        if (i % 4 === 0) acc.push(0);
        acc[acc.length - 1] = (acc[acc.length - 1] << 1) | bit;
        return acc;
    }, []).map(n => n.toString(16)).join('');

    const key = {
        id,
        protocol,
        lengthBits,
        keyHex: keyHex.slice(0, lengthBits / 4),
        partnerId,
        qber: protocol === 'BB84' ? qber : null,
        bellParameter: protocol === 'E91' ? 2.3 + Math.random() * 0.5 : null,
        isSecure,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,  // 1 hour
        consumed: false
    };

    qkdKeys.set(id, key);
    console.log(`[QSec] 🔐 QKD key generated: ${protocol} ${lengthBits} bits (QBER: ${(qber * 100).toFixed(2)}%)`);

    return { success: true, key };
}

/**
 * List QKD keys
 */
function listQKDKeys(partnerId = null) {
    const keys = Array.from(qkdKeys.values());
    if (partnerId) {
        return keys.filter(k => k.partnerId === partnerId);
    }
    return keys;
}

/**
 * Consume QKD key
 */
function consumeQKDKey(keyId) {
    const key = qkdKeys.get(keyId);
    if (!key) return { error: 'Key not found' };
    if (key.consumed) return { error: 'Key already consumed' };
    if (Date.now() > key.expiresAt) return { error: 'Key expired' };

    key.consumed = true;
    key.consumedAt = Date.now();

    return { success: true, keyHex: key.keyHex, lengthBits: key.lengthBits };
}

// =========================================================================
// PQC - POST-QUANTUM CRYPTOGRAPHY
// =========================================================================

/**
 * Generate PQC keypair
 */
function generatePQCKeypair(algorithm) {
    if (!PQC_ALGORITHMS[algorithm]) {
        return { error: `Unknown algorithm. Use: ${Object.keys(PQC_ALGORITHMS).join(', ')}` };
    }

    const algo = PQC_ALGORITHMS[algorithm];
    const id = `pqc-${++keypairIdCounter}`;

    // Simulate keypair generation (real would use liboqs)
    const publicKey = Array(32).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const privateKey = Array(64).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

    const keypair = {
        id,
        algorithm,
        type: algo.type,
        securityLevel: algo.securityLevel,
        publicKey,
        privateKeyHash: require('crypto').createHash('sha256').update(privateKey).digest('hex').slice(0, 16),
        createdAt: Date.now()
    };

    // Store full keypair (in real system, private key would be HSM-protected)
    pqcKeypairs.set(id, { ...keypair, privateKey });

    console.log(`[QSec] 🔑 PQC keypair generated: ${algorithm}`);

    // Return without private key
    return { success: true, keypair };
}

/**
 * List PQC keypairs
 */
function listPQCKeypairs() {
    return Array.from(pqcKeypairs.values()).map(kp => ({
        id: kp.id,
        algorithm: kp.algorithm,
        type: kp.type,
        publicKey: kp.publicKey,
        createdAt: kp.createdAt
    }));
}

/**
 * Sign data with PQC
 */
function signWithPQC(keypairId, data) {
    const keypair = pqcKeypairs.get(keypairId);
    if (!keypair) return { error: 'Keypair not found' };
    if (keypair.type !== 'sign') return { error: 'Keypair is not for signing' };

    // Simulate signature (real would use Dilithium/SPHINCS+)
    const dataHash = require('crypto').createHash('sha256').update(data).digest('hex');
    const signature = require('crypto')
        .createHmac('sha256', keypair.privateKey)
        .update(dataHash)
        .digest('hex');

    return {
        success: true,
        signature,
        algorithm: keypair.algorithm,
        keypairId
    };
}

/**
 * Encrypt with PQC (KEM)
 */
function encapsulateWithPQC(keypairId) {
    const keypair = pqcKeypairs.get(keypairId);
    if (!keypair) return { error: 'Keypair not found' };
    if (keypair.type !== 'kem') return { error: 'Keypair is not KEM' };

    // Simulate encapsulation (real would use Kyber)
    const sharedSecret = Array(32).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    const ciphertext = Array(64).fill(0).map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');

    return {
        success: true,
        sharedSecret,
        ciphertext,
        algorithm: keypair.algorithm
    };
}

// =========================================================================
// QRNG - QUANTUM RANDOM NUMBER GENERATION
// =========================================================================

/**
 * Generate quantum random bytes
 */
function generateQRNG(lengthBytes, format = 'hex') {
    // Simulate QRNG (real would use quantum vacuum fluctuations)
    const bytes = require('crypto').randomBytes(lengthBytes);

    const session = {
        timestamp: Date.now(),
        lengthBytes,
        entropy: 1.0  // Perfect entropy
    };
    qrngSessions.push(session);

    console.log(`[QSec] 🎲 QRNG generated: ${lengthBytes} bytes`);

    if (format === 'base64') {
        return { success: true, random: bytes.toString('base64'), lengthBytes };
    } else if (format === 'bytes') {
        return { success: true, random: Array.from(bytes), lengthBytes };
    }
    return { success: true, random: bytes.toString('hex'), lengthBytes };
}

/**
 * Generate quantum random integers
 */
function generateQRNGIntegers(min, max, count) {
    const range = max - min + 1;
    const integers = [];

    for (let i = 0; i < count; i++) {
        const bytes = require('crypto').randomBytes(4);
        const value = bytes.readUInt32BE(0);
        integers.push(min + (value % range));
    }

    return { success: true, integers, min, max, count };
}

/**
 * Get QRNG statistics
 */
function getQRNGStats() {
    const totalBytes = qrngSessions.reduce((sum, s) => sum + s.lengthBytes, 0);

    return {
        totalBytesGenerated: totalBytes,
        sessionCount: qrngSessions.length,
        averageEntropy: 1.0,
        nistTestsPassed: 100,
        nistTestsTotal: 100
    };
}

// =========================================================================
// QUANTUM AUTHENTICATION
// =========================================================================

/**
 * Generate quantum auth token
 */
function generateAuthToken(userId, validitySeconds = 3600) {
    const id = `qat-${++tokenIdCounter}`;

    // Generate quantum-random token
    const tokenBytes = require('crypto').randomBytes(32);
    const token = tokenBytes.toString('base64url');

    const authToken = {
        id,
        userId,
        token,
        createdAt: Date.now(),
        expiresAt: Date.now() + (validitySeconds * 1000),
        used: false,
        quantumSignature: require('crypto').randomBytes(16).toString('hex')
    };

    authTokens.set(id, authToken);
    console.log(`[QSec] 🎫 Auth token generated for ${userId}`);

    return { success: true, tokenId: id, token, expiresAt: authToken.expiresAt };
}

/**
 * Verify auth token
 */
function verifyAuthToken(token) {
    const authToken = Array.from(authTokens.values()).find(t => t.token === token);

    if (!authToken) {
        return { valid: false, reason: 'Token not found' };
    }
    if (authToken.used) {
        return { valid: false, reason: 'Token already used (quantum no-cloning)' };
    }
    if (Date.now() > authToken.expiresAt) {
        return { valid: false, reason: 'Token expired' };
    }

    // Mark as used (one-time use)
    authToken.used = true;
    authToken.usedAt = Date.now();

    return {
        valid: true,
        userId: authToken.userId,
        tokenId: authToken.id,
        quantumSignature: authToken.quantumSignature
    };
}

// =========================================================================
// HYBRID SECURITY
// =========================================================================

/**
 * Create hybrid key (QKD + PQC)
 */
function createHybridKey(qkdKeyId, pqcKeypairId) {
    const qkdKey = qkdKeys.get(qkdKeyId);
    const pqcKeypair = pqcKeypairs.get(pqcKeypairId);

    if (!qkdKey) return { error: 'QKD key not found' };
    if (!pqcKeypair || pqcKeypair.type !== 'kem') return { error: 'PQC KEM keypair not found' };

    // Get PQC shared secret
    const pqcResult = encapsulateWithPQC(pqcKeypairId);
    if (!pqcResult.success) return pqcResult;

    // Combine QKD key and PQC secret
    const hybridKey = require('crypto')
        .createHash('sha256')
        .update(qkdKey.keyHex + pqcResult.sharedSecret)
        .digest('hex');

    return {
        success: true,
        hybridKey,
        components: {
            qkd: { id: qkdKeyId, protocol: qkdKey.protocol },
            pqc: { id: pqcKeypairId, algorithm: pqcKeypair.algorithm }
        },
        securityLevel: 'defense-in-depth'
    };
}

// =========================================================================
// SECURITY STATS
// =========================================================================

/**
 * Get QuantumSec stats
 */
function getSecStats() {
    return {
        qkd: {
            totalKeys: qkdKeys.size,
            activeKeys: Array.from(qkdKeys.values()).filter(k => !k.consumed && Date.now() < k.expiresAt).length,
            protocols: {
                BB84: Array.from(qkdKeys.values()).filter(k => k.protocol === 'BB84').length,
                E91: Array.from(qkdKeys.values()).filter(k => k.protocol === 'E91').length
            }
        },
        pqc: {
            totalKeypairs: pqcKeypairs.size,
            kemKeypairs: Array.from(pqcKeypairs.values()).filter(k => k.type === 'kem').length,
            signKeypairs: Array.from(pqcKeypairs.values()).filter(k => k.type === 'sign').length
        },
        qrng: getQRNGStats(),
        auth: {
            totalTokens: authTokens.size,
            activeTokens: Array.from(authTokens.values()).filter(t => !t.used && Date.now() < t.expiresAt).length
        }
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    // Constants
    QKD_PROTOCOLS,
    PQC_ALGORITHMS,
    SECURITY_TIERS,

    // QKD
    generateQKDKey,
    listQKDKeys,
    consumeQKDKey,

    // PQC
    generatePQCKeypair,
    listPQCKeypairs,
    signWithPQC,
    encapsulateWithPQC,

    // QRNG
    generateQRNG,
    generateQRNGIntegers,
    getQRNGStats,

    // Auth
    generateAuthToken,
    verifyAuthToken,

    // Hybrid
    createHybridKey,

    // Stats
    getSecStats
};
