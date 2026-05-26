/**
 * Quantum Auth Middleware - JWT Authentication via QuantumSec
 * Provides API authentication using quantum-secured tokens.
 */

const quantumSec = require('./quantum-sec-api');

// Public endpoints that don't require auth
const PUBLIC_ENDPOINTS = [
    '/api/health',
    '/api/qsec/auth/login',
    '/api/qsec/auth/register',
    '/health',
    '/'
];

// Rate limiting store
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

/**
 * Generate API key
 */
function generateAPIKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'qk_';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

/**
 * Verify JWT token using QuantumSec
 */
function verifyToken(token) {
    if (!token) return { valid: false, error: 'No token provided' };

    // Remove Bearer prefix if present
    const cleanToken = token.replace('Bearer ', '');

    // Validate against QuantumSec auth tokens
    const authResult = quantumSec.validateAuthToken(cleanToken);

    if (authResult && authResult.valid) {
        return { valid: true, userId: authResult.userId, permissions: authResult.permissions || ['read'] };
    }

    // Fallback: check if it's an API key format
    if (cleanToken.startsWith('qk_')) {
        return { valid: true, type: 'apikey', permissions: ['read', 'write'] };
    }

    return { valid: false, error: 'Invalid token' };
}

/**
 * Rate limiting check
 */
function checkRateLimit(clientId) {
    const now = Date.now();
    const key = clientId || 'anonymous';

    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, windowStart: now });
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    const limit = rateLimits.get(key);

    // Reset window if expired
    if (now - limit.windowStart > RATE_LIMIT_WINDOW) {
        limit.count = 1;
        limit.windowStart = now;
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
    }

    // Check limit
    if (limit.count >= RATE_LIMIT_MAX) {
        return { allowed: false, error: 'Rate limit exceeded', retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - limit.windowStart)) / 1000) };
    }

    limit.count++;
    return { allowed: true, remaining: RATE_LIMIT_MAX - limit.count };
}

/**
 * Express middleware for authentication
 */
function authMiddleware(req, res, next) {
    // Skip auth for public endpoints
    if (PUBLIC_ENDPOINTS.some(ep => req.path.startsWith(ep))) {
        return next();
    }

    // Check rate limit first
    const clientId = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const rateCheck = checkRateLimit(clientId);

    if (!rateCheck.allowed) {
        return res.status(429).json({
            error: 'Rate limit exceeded',
            retryAfter: rateCheck.retryAfter
        });
    }

    // Set rate limit headers
    res.set('X-RateLimit-Remaining', rateCheck.remaining);

    // Check for auth bypass (dev mode)
    if (process.env.AUTH_BYPASS === 'true') {
        req.user = { id: 'dev', permissions: ['read', 'write', 'admin'] };
        return next();
    }

    // Get token from header
    const authHeader = req.headers.authorization || req.headers['x-api-key'];

    if (!authHeader) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify token
    const result = verifyToken(authHeader);

    if (!result.valid) {
        return res.status(401).json({ error: result.error });
    }

    // Attach user to request
    req.user = {
        id: result.userId || 'apikey-user',
        permissions: result.permissions
    };

    next();
}

/**
 * Permission check middleware
 */
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user || !req.user.permissions) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!req.user.permissions.includes(permission) && !req.user.permissions.includes('admin')) {
            return res.status(403).json({ error: `Permission '${permission}' required` });
        }

        next();
    };
}

module.exports = {
    generateAPIKey,
    verifyToken,
    checkRateLimit,
    authMiddleware,
    requirePermission,
    PUBLIC_ENDPOINTS
};
