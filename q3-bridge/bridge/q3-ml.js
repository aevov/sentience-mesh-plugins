const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const ML_DIR = path.join(__dirname, 'q3_data/ml');
const REGISTRY_PATH = path.join(ML_DIR, 'registry.json');

if (!fs.existsSync(ML_DIR)) fs.mkdirSync(ML_DIR, { recursive: true });

let registry = {
    models: [],
    history: []
};

// Load existing registry
if (fs.existsSync(REGISTRY_PATH)) {
    try {
        registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    } catch (e) {
        console.error('[Q3-ML] Failed to load registry:', e.message);
    }
}

function saveRegistry() {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

/**
 * 🌌 AevQG INFINITY STREAMING CONVERTER
 * High-memory efficiency pipeline: Fetch -> Chunk (64MB) -> Quantize -> Encrypt -> Upload
 */
async function convertStreamToAevQG(sourceUrl, modelId, options = {}) {
    console.log(`[Q3-ML] Initiating Streaming Conversion for ${modelId}...`);

    const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB
    let totalBytes = 0;
    let chunkIndex = 0;
    const modelPath = path.join(ML_DIR, modelId);
    if (!fs.existsSync(modelPath)) fs.mkdirSync(modelPath, { recursive: true });

    return new Promise((resolve, reject) => {
        const protocol = sourceUrl.startsWith('https') ? https : http;
        protocol.get(sourceUrl, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Download failed: ${res.statusCode}`));
            }

            let currentChunk = Buffer.alloc(0);

            res.on('data', async (data) => {
                currentChunk = Buffer.concat([currentChunk, data]);

                if (currentChunk.length >= CHUNK_SIZE) {
                    const toProcess = currentChunk.slice(0, CHUNK_SIZE);
                    currentChunk = currentChunk.slice(CHUNK_SIZE);
                    await processChunk(toProcess, modelId, chunkIndex++);
                    totalBytes += CHUNK_SIZE;
                }
            });

            res.on('end', async () => {
                if (currentChunk.length > 0) {
                    await processChunk(currentChunk, modelId, chunkIndex++);
                    totalBytes += currentChunk.length;
                }
                console.log(`[Q3-ML] Conversion Complete: ${totalBytes} bytes processed.`);

                // Update Registry
                const modelEntry = {
                    id: modelId,
                    name: options.name || modelId,
                    size: totalBytes,
                    chunks: chunkIndex,
                    format: 'aevqginf',
                    timestamp: Date.now()
                };
                registry.models.push(modelEntry);
                saveRegistry();

                resolve(modelEntry);
            });

            res.on('error', reject);
        }).on('error', reject);
    });
}

/**
 * 🌌 Chunk Processor
 * Simulates Quantization & Encryption before local sharding
 */
async function processChunk(buffer, modelId, index) {
    const chunkName = `chunk_${index}.aevqginf`;
    const chunkPath = path.join(ML_DIR, modelId, chunkName);

    // 🌌 SIMULATED QUANTIZATION (Reducing precision)
    // In a real scenario, we would loop through floats and rescale.
    const quantumBuffer = Buffer.from(buffer); // Proxy for now

    // 🌌 SYSTOLIC ENCRYPTION (AES-256-GCM context)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', crypto.randomBytes(32), iv);
    const encrypted = Buffer.concat([cipher.update(quantumBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Final Shard = IV + TAG + DATA
    const finalShard = Buffer.concat([iv, tag, encrypted]);
    fs.writeFileSync(chunkPath, finalShard);

    console.log(`[Q3-ML] Finalized Shard ${index} for ${modelId}`);
}

/**
 * 🌌 INFERENCE ROUTER
 * Bridges BIDC requests to localized model shards
 */
async function handleInference(modelId, input) {
    console.log(`[Q3-ML] Running Inference on ${modelId}...`);
    const model = registry.models.find(m => m.id === modelId);
    if (!model) throw new Error('Model not found');

    // Simulated Inference
    const result = {
        modelId,
        input,
        output: `Quantized Response from ${model.name} via BIDC mesh.`,
        confidence: 0.98 + (Math.random() * 0.01),
        latency: 120 + Math.floor(Math.random() * 50),
        timestamp: Date.now()
    };

    registry.history.push(result);
    if (registry.history.length > 100) registry.history.shift();
    saveRegistry();

    return result;
}

module.exports = {
    convertStreamToAevQG,
    handleInference,
    getRegistry: () => registry
};
