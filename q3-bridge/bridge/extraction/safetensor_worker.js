/**
 * SafeTensor Worker - Parallel Chunk Processing
 * Processes SafeTensor chunks in background thread
 */

// Message types from main thread
const MSG_PARSE_HEADER = 'parse_header';
const MSG_PARSE_TENSORS = 'parse_tensors';
const MSG_CANCEL = 'cancel';

// Message types to main thread
const MSG_PROGRESS = 'progress';
const MSG_RESULT = 'result';
const MSG_ERROR = 'error';
const MSG_LOG = 'log';

let cancelled = false;

/**
 * Parse SafeTensor header (8-byte length + JSON metadata)
 */
function parseHeader(arrayBuffer) {
    const view = new DataView(arrayBuffer);

    // Read header length (first 8 bytes, little-endian)
    const headerLength = Number(view.getBigUint64(0, true));

    // Read JSON metadata
    const metadataBytes = new Uint8Array(arrayBuffer, 8, headerLength);
    const metadataText = new TextDecoder().decode(metadataBytes);
    const metadata = JSON.parse(metadataText);

    const dataStart = 8 + headerLength;

    return {
        headerLength,
        metadata,
        dataStart,
        totalSize: arrayBuffer.byteLength
    };
}

/**
 * Parse subset of tensors assigned to this worker
 */
function parseTensors(arrayBuffer, tensorNames, metadata, dataStart, workerId) {
    const tensors = {};
    let processed = 0;
    const total = tensorNames.length;

    for (const name of tensorNames) {
        if (cancelled) {
            throw new Error('Worker cancelled');
        }

        const info = metadata[name];
        if (!info) continue;

        const { dtype, shape, data_offsets } = info;
        const [start, end] = data_offsets;

        // Read tensor data
        const tensorData = new Uint8Array(
            arrayBuffer,
            dataStart + start,
            end - start
        );

        tensors[name] = {
            name: name,
            dtype: dtype,
            shape: shape,
            size: shape.reduce((a, b) => a * b, 1),
            dataSize: tensorData.length,
            data: tensorData,
            stats: calculateTensorStats(tensorData, dtype, shape)
        };

        processed++;

        // Report progress every 10%
        if (processed % Math.max(1, Math.floor(total / 10)) === 0) {
            postMessage({
                type: MSG_PROGRESS,
                workerId: workerId,
                progress: (processed / total) * 100,
                processed: processed,
                total: total
            });
        }
    }

    return tensors;
}

/**
 * Calculate basic statistics from tensor data
 */
function calculateTensorStats(data, dtype, shape) {
    // For now, return basic stats
    // In production, would parse based on dtype

    const stats = {
        dtype: dtype,
        shape: shape,
        elements: shape.reduce((a, b) => a * b, 1),
        bytes: data.length
    };

    // Sample statistics (first 1000 elements for speed)
    const sampleSize = Math.min(1000, data.length);
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < sampleSize; i++) {
        const val = data[i];
        sum += val;
        min = Math.min(min, val);
        max = Math.max(max, val);
    }

    stats.mean = sum / sampleSize;
    stats.min = min;
    stats.max = max;
    stats.range = max - min;

    return stats;
}

/**
 * Main message handler
 */
self.addEventListener('message', async (event) => {
    const { type, payload } = event.data;

    try {
        switch (type) {
            case MSG_PARSE_HEADER:
                const headerInfo = parseHeader(payload.arrayBuffer);
                postMessage({
                    type: MSG_RESULT,
                    subtype: 'header',
                    result: headerInfo
                });
                break;

            case MSG_PARSE_TENSORS:
                const { arrayBuffer, tensorNames, metadata, dataStart, workerId } = payload;

                postMessage({
                    type: MSG_LOG,
                    workerId: workerId,
                    message: `Worker ${workerId}: Processing ${tensorNames.length} tensors`
                });

                const tensors = parseTensors(arrayBuffer, tensorNames, metadata, dataStart, workerId);

                postMessage({
                    type: MSG_RESULT,
                    subtype: 'tensors',
                    workerId: workerId,
                    result: {
                        tensors: tensors,
                        count: Object.keys(tensors).length
                    }
                });
                break;

            case MSG_CANCEL:
                cancelled = true;
                postMessage({
                    type: MSG_LOG,
                    message: 'Worker cancelled'
                });
                break;

            default:
                postMessage({
                    type: MSG_ERROR,
                    error: `Unknown message type: ${type}`
                });
        }
    } catch (error) {
        postMessage({
            type: MSG_ERROR,
            error: error.message,
            stack: error.stack
        });
    }
});

postMessage({ type: MSG_LOG, message: '✅ SafeTensor Worker initialized' });
