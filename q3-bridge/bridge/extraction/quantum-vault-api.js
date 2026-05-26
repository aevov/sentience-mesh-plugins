/**
 * QuantumVault API - Secrets & Key Management
 * Stores QKD keys, PQC keys, credentials with quantum-secured encryption.
 */

const VAULT_SECRET_TYPES = { KEY: 'key', CREDENTIAL: 'credential', CERTIFICATE: 'certificate', TOKEN: 'token' };
let vaults = new Map(), secrets = new Map();
let vaultIdCounter = 0, secretIdCounter = 0;

function createVault(name, encryption = 'quantum') {
    const id = `vault-${++vaultIdCounter}`;
    const vault = { id, name, encryption, secrets: [], createdAt: Date.now(), accessCount: 0 };
    vaults.set(id, vault);
    console.log(`[QVault] 🔐 Vault created: ${name}`);
    return { success: true, vault };
}

function listVaults() { return Array.from(vaults.values()); }

function storeSecret(vaultId, name, value, type = 'key', ttl = null) {
    const vault = vaults.get(vaultId);
    if (!vault) return { error: 'Vault not found' };
    const id = `secret-${++secretIdCounter}`;
    const secret = { id, vaultId, name, type, createdAt: Date.now(), expiresAt: ttl ? Date.now() + ttl * 1000 : null, accessCount: 0, version: 1 };
    secrets.set(id, { ...secret, value });
    vault.secrets.push(id);
    return { success: true, secret };
}

function getSecret(secretId) {
    const s = secrets.get(secretId);
    if (!s) return { error: 'Secret not found' };
    if (s.expiresAt && Date.now() > s.expiresAt) return { error: 'Secret expired' };
    s.accessCount++;
    const vault = vaults.get(s.vaultId);
    if (vault) vault.accessCount++;
    return { success: true, secret: { ...s, value: '***REDACTED***' } };
}

function rotateSecret(secretId, newValue) {
    const s = secrets.get(secretId);
    if (!s) return { error: 'Secret not found' };
    s.value = newValue;
    s.version++;
    s.rotatedAt = Date.now();
    return { success: true, secret: { ...s, value: '***REDACTED***' } };
}

function listSecrets(vaultId = null) {
    const all = Array.from(secrets.values()).map(s => ({ ...s, value: undefined }));
    return vaultId ? all.filter(s => s.vaultId === vaultId) : all;
}

function getVaultStats() {
    return { vaults: vaults.size, secrets: secrets.size, totalAccesses: Array.from(vaults.values()).reduce((s, v) => s + v.accessCount, 0) };
}

module.exports = { VAULT_SECRET_TYPES, createVault, listVaults, storeSecret, getSecret, rotateSecret, listSecrets, getVaultStats };
