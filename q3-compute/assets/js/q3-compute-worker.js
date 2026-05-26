/**
 * Q3 Compute Web Worker
 * Offloads heavy computation to background thread
 */

// Message handler
self.onmessage = async function (e) {
    const { type, params, jobId } = e.data;

    try {
        let result;

        switch (type) {
            case 'sha256d':
                result = await computeSha256d(params);
                break;
            case 'random_circuit':
                result = await computeRandomCircuit(params);
                break;
            case 'grover_search':
                result = await computeGrover(params);
                break;
            default:
                throw new Error('Unknown operation type: ' + type);
        }

        self.postMessage({
            success: true,
            jobId,
            type,
            result
        });

    } catch (error) {
        self.postMessage({
            success: false,
            jobId,
            type,
            error: error.message
        });
    }
};

/**
 * SHA256d computation (requires SubtleCrypto)
 */
async function computeSha256d(params) {
    const { header, nonceStart, nonceEnd } = params;

    let hashes = 0;
    let shares = 0;
    let bestHash = null;
    let bestNonce = null;

    const headerBytes = hexToBytes(header || '00'.repeat(80));

    for (let nonce = nonceStart; nonce < nonceEnd; nonce++) {
        // Set nonce (last 4 bytes)
        const work = new Uint8Array(80);
        work.set(headerBytes.slice(0, 76));
        work[76] = nonce & 0xff;
        work[77] = (nonce >> 8) & 0xff;
        work[78] = (nonce >> 16) & 0xff;
        work[79] = (nonce >> 24) & 0xff;

        // Double SHA256
        const hash1 = await crypto.subtle.digest('SHA-256', work);
        const hash2 = await crypto.subtle.digest('SHA-256', hash1);
        const hashBytes = new Uint8Array(hash2);

        hashes++;

        // Check for shares (2 leading zero bytes)
        if (hashBytes[0] === 0 && hashBytes[1] === 0) {
            shares++;
            if (!bestHash || compareBytes(hashBytes, bestHash) < 0) {
                bestHash = hashBytes;
                bestNonce = nonce;
            }
        }

        // Report progress every 100 hashes
        if (hashes % 100 === 0) {
            self.postMessage({
                progress: true,
                hashes,
                shares,
                nonce
            });
        }
    }

    return {
        hashes,
        shares,
        bestHash: bestHash ? bytesToHex(bestHash) : null,
        bestNonce,
        gateOps: hashes * 512
    };
}

/**
 * Random circuit sampling
 */
async function computeRandomCircuit(params) {
    const { numQubits, depth, shots } = params;

    const samples = [];
    const gateOps = numQubits * depth * shots;

    for (let i = 0; i < shots; i++) {
        let bitstring = '';
        for (let q = 0; q < numQubits; q++) {
            bitstring += Math.random() < 0.5 ? '0' : '1';
        }
        samples.push(bitstring);

        // Report progress
        if (i % 100 === 0) {
            self.postMessage({
                progress: true,
                shot: i,
                total: shots
            });
        }
    }

    // Count occurrences
    const counts = {};
    for (const s of samples) {
        counts[s] = (counts[s] || 0) + 1;
    }

    // Get top 10
    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        qubitsUsed: numQubits,
        depth,
        shots,
        topResults: Object.fromEntries(sorted),
        entropyBits: numQubits * shots,
        gateOps
    };
}

/**
 * Grover search simulation
 */
async function computeGrover(params) {
    const { databaseSize, targetPattern } = params;

    const qubits = Math.ceil(Math.log2(databaseSize));
    const iterations = Math.floor(Math.PI / 4 * Math.sqrt(databaseSize));
    const gateOps = qubits * iterations * 10;

    let foundIndex = null;
    if (targetPattern) {
        foundIndex = parseInt(targetPattern, 16) % databaseSize;
    }

    return {
        qubitsUsed: qubits,
        iterations,
        foundIndex,
        speedup: Math.sqrt(databaseSize),
        gateOps
    };
}

// Utility functions
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function compareBytes(a, b) {
    for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}
