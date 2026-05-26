const { spawn } = require('child_process');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { formidable } = require('formidable');
const { promisify } = require('util');
const { pipeline } = require('stream');
const streamPipeline = promisify(pipeline);
const WebSocket = require('ws');
const AWS = require('aws-sdk');

// 🌌 Standalone Plugin Paths
const CORE_DIR = path.join(__dirname, 'core');
const EXTRACTION_DIR = path.join(__dirname, 'extraction');

// Dynamic requires
const Q3 = require(path.join(CORE_DIR, 'index.js'));
const QISP = require(path.join(EXTRACTION_DIR, 'quantum-isp-api.js'));
const QSEC = require(path.join(EXTRACTION_DIR, 'quantum-sec-api.js'));
const QML = require('./q3-ml.js');
const { initializeQ3Discovery } = require('./q3-client-discovery.js');

const PORT = 8082;
const CONFIG_PATH = path.join(__dirname, '..', '..', 'q3-config.json'); // Look in plugin root or uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads-temp');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

let q3Config = {};
let q3System = null;
let activeDiscovery = null;
const SWAP_JOBS = new Map();

async function startDiscovery() {
    console.log('[Q3 Bridge] Starting auto-discovery...');
    try {
        activeDiscovery = await initializeQ3Discovery();
        if (activeDiscovery && activeDiscovery.apiEndpoint) {
            console.log(`[Q3 Bridge] Discovery Successful: ${activeDiscovery.apiEndpoint}`);
        }
    } catch (e) {
        console.error('[Q3 Bridge] Discovery initialization failed:', e.message);
    }
}

async function loadConfig() {
    try {
        // Fallback config if file doesn't exist
        if (fs.existsSync(CONFIG_PATH)) {
            q3Config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        } else {
            console.log('[Q3 Bridge] Config not found at ' + CONFIG_PATH + ', using defaults.');
            q3Config = {
                endpoint: 'http://172.233.130.112:4064',
                access_key: 'q3_access',
                secret_key: 'q3_secret'
            };
        }

        q3System = await Q3.createQ3System({
            backend: 'hybrid',
            storageDir: path.join(__dirname, 'q3-storage-local'),
            'Q3 StorageEndpoint': 'https://s3.q3storage.eu',
            'Q3 StorageAccessKey': q3Config.access_key,
            'Q3 StorageSecretKey': q3Config.secret_key,
            'Q3 StorageBucket': 'cr8os1'
        });
        console.log(`[Q3 Bridge] Standalone Q3 System Initialized`);
    } catch (e) {
        console.error('[Q3 Bridge] Init failed:', e.message);
    }
}

(async () => {
    await loadConfig();
    startDiscovery();
})();

function getS3Config(backendInput = 'q3') {
    let endpoint = q3Config.endpoint;
    let accessKey = q3Config.access_key;
    let secretKey = q3Config.secret_key;
    const isQ3 = backendInput === 'q3' || backendInput.startsWith('q3-');

    if (backendInput === 'Q3 Storage') {
        endpoint = 'https://s3.q3storage.eu';
    } else if (isQ3) {
        endpoint = (activeDiscovery && activeDiscovery.apiEndpoint) || q3Config.endpoint;
    }

    return { endpoint, accessKey, secretKey, isQ3 };
}

function executeS5cmd(args, backendInput = 'q3') {
    return new Promise(async (resolve, reject) => {
        const { endpoint, accessKey, secretKey, isQ3 } = getS3Config(backendInput);
        const startTime = Date.now();

        const s5cmdPath = path.join(__dirname, 's5cmd');
        const translatedArgs = args.map(arg => typeof arg === 'string' ? arg.replace(/^q3:\/\//i, 's3://') : arg);
        const s5cmdArgs = ['--no-verify-ssl', '--endpoint-url', endpoint, ...translatedArgs];

        const spawnEnv = {
            ...process.env,
            AWS_ACCESS_KEY_ID: accessKey,
            AWS_SECRET_ACCESS_KEY: secretKey,
            AWS_REGION: 'us-east-1'
        };

        const child = spawn(s5cmdPath, s5cmdArgs, { env: spawnEnv });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', data => stdout += data);
        child.stderr.on('data', data => stderr += data);

        child.on('close', (code) => {
            const duration = Date.now() - startTime;
            resolve({
                code: code === null ? 1 : code,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                duration
            });
        });

        child.on('error', (err) => reject(err));
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);

    if (parsedUrl.pathname === '/q3/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const { args, backend } = JSON.parse(body);
            const result = await executeS5cmd(args, backend);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        });
    } else if (parsedUrl.pathname === '/q3/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', version: '1.0.0-wp' }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`[Q3 Bridge] Active on Port ${PORT}`);
});

const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', (ws) => {
    console.log('[BIDC] Client connected');
    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        if (data.type === 'binary_compilation') {
            const { payload, filename, jobId } = data;
            const tempPath = path.join(UPLOAD_DIR, filename || `build_${Date.now()}.tar.gz`);
            const buffer = Buffer.from(payload, 'base64');
            fs.writeFileSync(tempPath, buffer);

            ws.send(JSON.stringify({ type: 'build_status', status: 'RECEIVED', jobId }));

            // Simulation logic
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'build_status', status: 'COMPILING', progress: 50, jobId }));
            }, 2000);

            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'build_status', status: 'SUCCESS', jobId, artifactUrl: 'remote-link' }));
            }, 5000);
        }
    });
});
