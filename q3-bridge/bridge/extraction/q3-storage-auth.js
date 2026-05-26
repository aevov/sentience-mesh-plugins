// Q3 Carrier-Native Authentication Module
// Stores users and sessions directly in Q3 Carrier S3
// No external database required

const crypto = require('crypto');
const AWS = require('aws-sdk');
const edgeConfig = require('./quantumcloud-edge-config');

// S3 Client for Q3 Carrier
const s3 = new AWS.S3({
    endpoint: edgeConfig.Q3 Carrier.endpoint || 'https://s3.Q3 Carrier.eu',
    accessKeyId: edgeConfig.Q3 Carrier.accessKeyId,
    secretAccessKey: edgeConfig.Q3 Carrier.secretAccessKey,
    region: edgeConfig.Q3 Carrier.region || 'eu-west-1',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

const BUCKET = edgeConfig.Q3 Carrier.bucket || 'cr8os1';
const AUTH_PREFIX = 'auth/';
const USERS_PREFIX = `${AUTH_PREFIX}users/`;
const SESSIONS_PREFIX = `${AUTH_PREFIX}sessions/`;

/**
 * Hash password with salt
 */
function hashPassword(password, salt = null) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

/**
 * Verify password against stored hash
 */
function verifyPassword(password, storedHash, salt) {
    const { hash } = hashPassword(password, salt);
    return hash === storedHash;
}

/**
 * Generate session token
 */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Q3 Carrier Auth Class
 */
class Q3 CarrierAuth {
    constructor() {
        this.sessionTTL = 86400 * 7; // 7 days
    }

    /**
     * Register a new user
     */
    async register(username, password, metadata = {}) {
        // Validate
        if (!username || !password) {
            return { success: false, error: 'Username and password required' };
        }

        if (password.length < 8) {
            return { success: false, error: 'Password must be at least 8 characters' };
        }

        // Check if user exists
        const userKey = `${USERS_PREFIX}${username.toLowerCase()}.json`;

        try {
            await s3.headObject({ Bucket: BUCKET, Key: userKey }).promise();
            return { success: false, error: 'Username already exists' };
        } catch (err) {
            if (err.code !== 'NotFound') {
                return { success: false, error: err.message };
            }
        }

        // Hash password
        const { salt, hash } = hashPassword(password);

        // Create user record
        const user = {
            username: username.toLowerCase(),
            displayName: username,
            passwordHash: hash,
            salt,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            metadata: {
                ...metadata,
                role: metadata.role || 'user',
            },
        };

        // Store in Q3 Carrier
        try {
            await s3.putObject({
                Bucket: BUCKET,
                Key: userKey,
                Body: JSON.stringify(user, null, 2),
                ContentType: 'application/json',
            }).promise();

            console.log(`✅ User registered: ${username}`);

            return {
                success: true,
                user: {
                    username: user.username,
                    displayName: user.displayName,
                    role: user.metadata.role,
                },
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Login user
     */
    async login(username, password) {
        if (!username || !password) {
            return { success: false, error: 'Username and password required' };
        }

        const userKey = `${USERS_PREFIX}${username.toLowerCase()}.json`;

        // Get user record
        let user;
        try {
            const result = await s3.getObject({ Bucket: BUCKET, Key: userKey }).promise();
            user = JSON.parse(result.Body.toString());
        } catch (err) {
            if (err.code === 'NoSuchKey') {
                return { success: false, error: 'Invalid username or password' };
            }
            return { success: false, error: err.message };
        }

        // Verify password
        if (!verifyPassword(password, user.passwordHash, user.salt)) {
            return { success: false, error: 'Invalid username or password' };
        }

        // Create session
        const token = generateToken();
        const session = {
            token,
            username: user.username,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + this.sessionTTL * 1000).toISOString(),
            metadata: {
                role: user.metadata?.role || 'user',
            },
        };

        // Store session in Q3 Carrier
        const sessionKey = `${SESSIONS_PREFIX}${token}.json`;
        try {
            await s3.putObject({
                Bucket: BUCKET,
                Key: sessionKey,
                Body: JSON.stringify(session, null, 2),
                ContentType: 'application/json',
            }).promise();

            // Update last login
            user.lastLogin = new Date().toISOString();
            await s3.putObject({
                Bucket: BUCKET,
                Key: userKey,
                Body: JSON.stringify(user, null, 2),
                ContentType: 'application/json',
            }).promise();

            console.log(`🔐 User logged in: ${username}`);

            return {
                success: true,
                token,
                user: {
                    username: user.username,
                    displayName: user.displayName,
                    role: user.metadata?.role || 'user',
                },
                expiresAt: session.expiresAt,
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Verify session token
     */
    async verify(token) {
        if (!token) {
            return { success: false, valid: false, error: 'Token required' };
        }

        const sessionKey = `${SESSIONS_PREFIX}${token}.json`;

        try {
            const result = await s3.getObject({ Bucket: BUCKET, Key: sessionKey }).promise();
            const session = JSON.parse(result.Body.toString());

            // Check expiration
            if (new Date(session.expiresAt) < new Date()) {
                // Delete expired session
                await this.logout(token);
                return { success: true, valid: false, error: 'Session expired' };
            }

            return {
                success: true,
                valid: true,
                user: {
                    username: session.username,
                    role: session.metadata?.role || 'user',
                },
                expiresAt: session.expiresAt,
            };
        } catch (err) {
            if (err.code === 'NoSuchKey') {
                return { success: true, valid: false, error: 'Invalid token' };
            }
            return { success: false, valid: false, error: err.message };
        }
    }

    /**
     * Logout (delete session)
     */
    async logout(token) {
        if (!token) {
            return { success: false, error: 'Token required' };
        }

        const sessionKey = `${SESSIONS_PREFIX}${token}.json`;

        try {
            await s3.deleteObject({ Bucket: BUCKET, Key: sessionKey }).promise();
            console.log(`🔓 Session ended: ${token.substring(0, 8)}...`);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Get user profile
     */
    async getUser(username) {
        const userKey = `${USERS_PREFIX}${username.toLowerCase()}.json`;

        try {
            const result = await s3.getObject({ Bucket: BUCKET, Key: userKey }).promise();
            const user = JSON.parse(result.Body.toString());

            // Don't return sensitive data
            return {
                success: true,
                user: {
                    username: user.username,
                    displayName: user.displayName,
                    role: user.metadata?.role || 'user',
                    createdAt: user.createdAt,
                    lastLogin: user.lastLogin,
                },
            };
        } catch (err) {
            if (err.code === 'NoSuchKey') {
                return { success: false, error: 'User not found' };
            }
            return { success: false, error: err.message };
        }
    }

    /**
     * List all users (admin only)
     */
    async listUsers() {
        try {
            const result = await s3.listObjectsV2({
                Bucket: BUCKET,
                Prefix: USERS_PREFIX,
            }).promise();

            const users = [];
            for (const obj of result.Contents || []) {
                if (obj.Key.endsWith('.json')) {
                    try {
                        const data = await s3.getObject({ Bucket: BUCKET, Key: obj.Key }).promise();
                        const user = JSON.parse(data.Body.toString());
                        users.push({
                            username: user.username,
                            displayName: user.displayName,
                            role: user.metadata?.role || 'user',
                            createdAt: user.createdAt,
                            lastLogin: user.lastLogin,
                        });
                    } catch (e) {
                        // Skip invalid entries
                    }
                }
            }

            return { success: true, users };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Change password
     */
    async changePassword(username, oldPassword, newPassword) {
        // Verify old password first
        const loginResult = await this.login(username, oldPassword);
        if (!loginResult.success) {
            return { success: false, error: 'Current password is incorrect' };
        }

        // Logout the session we just created
        await this.logout(loginResult.token);

        if (newPassword.length < 8) {
            return { success: false, error: 'New password must be at least 8 characters' };
        }

        const userKey = `${USERS_PREFIX}${username.toLowerCase()}.json`;

        try {
            const result = await s3.getObject({ Bucket: BUCKET, Key: userKey }).promise();
            const user = JSON.parse(result.Body.toString());

            // Update password
            const { salt, hash } = hashPassword(newPassword);
            user.passwordHash = hash;
            user.salt = salt;
            user.passwordChangedAt = new Date().toISOString();

            await s3.putObject({
                Bucket: BUCKET,
                Key: userKey,
                Body: JSON.stringify(user, null, 2),
                ContentType: 'application/json',
            }).promise();

            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
}

// Express middleware for auth
function authMiddleware(auth) {
    return async (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '') ||
            req.query.token ||
            req.cookies?.token;

        if (!token) {
            req.user = null;
            return next();
        }

        const result = await auth.verify(token);
        if (result.valid) {
            req.user = result.user;
            req.token = token;
        } else {
            req.user = null;
        }

        next();
    };
}

// Require auth middleware
function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    next();
}

// Require admin middleware
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
}

// Singleton instance
const auth = new Q3 CarrierAuth();

module.exports = {
    Q3 CarrierAuth,
    auth,
    authMiddleware,
    requireAuth,
    requireAdmin,
    hashPassword,
    verifyPassword,
    generateToken,
};
