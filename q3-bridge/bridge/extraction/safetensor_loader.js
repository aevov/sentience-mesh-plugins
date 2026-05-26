/**
 * SafeTensor File Loader for Advanced Pattern Extractor
 * Loads and parses safetensor files (Hugging Face model format)
 * Extracts patterns from model weights, embeddings, and architecture
 */

(function (window) {
    'use strict';

    window.SafeTensorLoader = {
        // Loaded safetensor data
        loadedModels: {},

        // Metadata cache
        metadata: {},

        /**
         * Parse SafeTensor file format
         * SafeTensor format: [8 bytes header length][JSON metadata][tensor data]
         */
        async parseSafeTensor(arrayBuffer, filename) {
            try {
                const view = new DataView(arrayBuffer);

                // Read header length (first 8 bytes, little-endian)
                const headerLength = Number(view.getBigUint64(0, true));

                // Read JSON metadata
                const metadataBytes = new Uint8Array(arrayBuffer, 8, headerLength);
                const metadataText = new TextDecoder().decode(metadataBytes);
                const metadata = JSON.parse(metadataText);

                // Check if this is header-only mode (buffer smaller than full file)
                const dataStart = 8 + headerLength;
                const isHeaderOnly = arrayBuffer.byteLength < dataStart + 1000; // Less than expected data

                // Extract tensor information
                const tensors = {};

                if (isHeaderOnly) {
                    console.log('📋 Header-only mode: Creating tensor metadata without loading data');
                    // Only create metadata, don't load actual tensor data
                    for (const [name, info] of Object.entries(metadata)) {
                        if (name === '__metadata__') continue;

                        const { dtype, shape, data_offsets } = info;

                        tensors[name] = {
                            name: name,
                            dtype: dtype,
                            shape: shape,
                            size: shape.reduce((a, b) => a * b, 1),
                            dataSize: data_offsets ? data_offsets[1] - data_offsets[0] : 0,
                            data: null, // No data in header-only mode
                            stats: {
                                dtype: dtype,
                                shape: shape,
                                elementCount: shape.reduce((a, b) => a * b, 1),
                                byteSize: data_offsets ? data_offsets[1] - data_offsets[0] : 0,
                                headerOnly: true
                            }
                        };
                    }
                } else {
                    // Full data mode
                    for (const [name, info] of Object.entries(metadata)) {
                        if (name === '__metadata__') continue;

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
                            // Calculate statistics
                            stats: this.calculateTensorStats(tensorData, dtype, shape)
                        };
                    }
                }

                const modelId = `model_${Date.now()}`;
                this.loadedModels[modelId] = {
                    id: modelId,
                    filename: filename,
                    metadata: metadata.__metadata__ || {},
                    tensors: tensors,
                    tensorCount: Object.keys(tensors).length,
                    totalSize: arrayBuffer.byteLength,
                    loadedAt: new Date().toISOString()
                };

                return {
                    success: true,
                    modelId: modelId,
                    model: this.loadedModels[modelId]
                };

            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        /**
         * Parse ONLY metadata from SafeTensor file (no data loading)
         * For large files - loads just the JSON header
         */
        async parseMetadataOnly(headerArrayBuffer, filename, fullFileSize) {
            try {
                const view = new DataView(headerArrayBuffer);

                // Read header length (first 8 bytes, little-endian)
                const headerLength = Number(view.getBigUint64(0, true));

                // Read JSON metadata
                const metadataBytes = new Uint8Array(headerArrayBuffer, 8, headerLength);
                const metadataText = new TextDecoder().decode(metadataBytes);
                const metadata = JSON.parse(metadataText);

                const dataStart = 8 + headerLength;

                // Create tensor list (metadata only - NO data)
                const tensors = {};
                for (const [name, info] of Object.entries(metadata)) {
                    if (name === '__metadata__') continue;

                    const { dtype, shape, data_offsets } = info;

                    tensors[name] = {
                        name: name,
                        dtype: dtype,
                        shape: shape,
                        size: shape.reduce((a, b) => a * b, 1),
                        dataSize: data_offsets[1] - data_offsets[0],
                        dataOffset: dataStart + data_offsets[0],
                        data: null, // Not loaded yet
                        loaded: false,
                        stats: {
                            dtype: dtype,
                            shape: shape,
                            elementCount: shape.reduce((a, b) => a * b, 1),
                            byteSize: data_offsets[1] - data_offsets[0]
                        }
                    };
                }

                const modelId = `model_${Date.now()}`;
                this.loadedModels[modelId] = {
                    id: modelId,
                    filename: filename,
                    metadata: metadata.__metadata__ || {},
                    tensors: tensors,
                    tensorCount: Object.keys(tensors).length,
                    totalSize: fullFileSize,
                    totalParameters: Object.values(tensors).reduce((sum, t) => sum + t.size, 0),
                    layerCount: Object.keys(this.groupTensorsByLayer(tensors)).length,
                    loadedAt: new Date().toISOString(),
                    loadMethod: 'metadata-only',
                    dataStart: dataStart
                };

                return {
                    success: true,
                    modelId: modelId,
                    model: this.loadedModels[modelId]
                };

            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        /**
         * Load individual tensor data from file (for incremental loading)
         * @param {File} file - Original file object
         * @param {string} modelId - Model ID
         * @param {string} tensorName - Name of tensor to load
         */
        async loadTensorData(file, modelId, tensorName) {
            const model = this.loadedModels[modelId];
            if (!model) {
                return { success: false, error: 'Model not found' };
            }

            const tensor = model.tensors[tensorName];
            if (!tensor) {
                return { success: false, error: 'Tensor not found' };
            }

            if (tensor.loaded) {
                return { success: true, message: 'Already loaded', data: tensor.data };
            }

            try {
                // Read tensor data from file using its offset
                const blob = file.slice(tensor.dataOffset, tensor.dataOffset + tensor.dataSize);
                const arrayBuffer = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(new Error(`Failed to read tensor: ${e.target.error}`));
                    reader.readAsArrayBuffer(blob);
                });

                const tensorData = new Uint8Array(arrayBuffer);
                tensor.data = tensorData;
                tensor.loaded = true;
                tensor.stats = this.calculateTensorStats(tensorData, tensor.dtype, tensor.shape);

                return {
                    success: true,
                    data: tensorData,
                    stats: tensor.stats
                };

            } catch (error) {
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        /**
         * Calculate basic statistics from tensor data
         */
        calculateTensorStats(data, dtype, shape) {
            const stats = {
                dtype: dtype,
                shape: shape,
                elementCount: shape.reduce((a, b) => a * b, 1),
                byteSize: data.length
            };

            // For float32, calculate mean, min, max
            if (dtype === 'F32') {
                const floatView = new Float32Array(data.buffer, data.byteOffset, data.length / 4);
                let sum = 0, min = Infinity, max = -Infinity;

                for (let i = 0; i < floatView.length; i++) {
                    const val = floatView[i];
                    sum += val;
                    if (val < min) min = val;
                    if (val > max) max = val;
                }

                stats.mean = sum / floatView.length;
                stats.min = min;
                stats.max = max;
                stats.range = max - min;
            }

            return stats;
        },

        /**
         * Extract patterns from loaded model
         */
        async extractPatternsFromModel(modelId, options = {}) {
            const model = this.loadedModels[modelId];
            if (!model) {
                return { success: false, error: 'Model not found' };
            }

            const patterns = [];
            const extractEmbeddings = options.extractEmbeddings !== false;
            const extractArchitecture = options.extractArchitecture !== false;
            const extractWeights = options.extractWeights !== false;

            // 1. Extract architecture patterns
            if (extractArchitecture) {
                const archPatterns = this.extractArchitecturePatterns(model);
                patterns.push(...archPatterns);
            }

            // 2. Extract embedding patterns
            if (extractEmbeddings) {
                const embPatterns = this.extractEmbeddingPatterns(model);
                patterns.push(...embPatterns);
            }

            // 3. Extract weight patterns
            if (extractWeights) {
                const weightPatterns = this.extractWeightPatterns(model);
                patterns.push(...weightPatterns);
            }

            return {
                success: true,
                modelId: modelId,
                patternsExtracted: patterns.length,
                patterns: patterns
            };
        },

        /**
         * Extract architecture patterns from model structure
         */
        extractArchitecturePatterns(model) {
            const patterns = [];
            const layerGroups = this.groupTensorsByLayer(model.tensors);

            for (const [layerName, tensors] of Object.entries(layerGroups)) {
                const layerType = this.detectLayerType(layerName, tensors);

                const pattern = {
                    id: `arch_${model.id}_${layerName}_${Date.now()}`,
                    category: 'ml_architecture',
                    categoryName: 'ML Architecture',
                    parentCategory: 'data_science',
                    parentCategoryName: 'Data Science & Analytics',
                    parentIcon: '📊',
                    keywords: [
                        'architecture',
                        'model',
                        layerType,
                        layerName.includes('attention') ? 'attention' : null,
                        layerName.includes('norm') ? 'normalization' : null,
                        layerName.includes('linear') ? 'linear' : null
                    ].filter(Boolean),
                    template: btoa(this.generateArchitectureCode(layerName, tensors, layerType)),
                    confidence: 0.95,
                    intent: 'architecture_reference',
                    votes: 1,
                    embedding: this.createArchitectureEmbedding(tensors),
                    sourceQuery: `${layerType} layer from ${model.filename}`,
                    createdAt: new Date().toISOString(),
                    synthetic: false,
                    metadata: {
                        modelId: model.id,
                        modelFilename: model.filename,
                        layerName: layerName,
                        layerType: layerType,
                        tensorCount: tensors.length,
                        totalParams: tensors.reduce((sum, t) => sum + t.size, 0)
                    }
                };

                patterns.push(pattern);
            }

            return patterns;
        },

        /**
         * Extract embedding patterns (word embeddings, token embeddings, etc.)
         */
        extractEmbeddingPatterns(model) {
            const patterns = [];

            for (const [name, tensor] of Object.entries(model.tensors)) {
                // Check if this is an embedding tensor
                if (this.isEmbeddingTensor(name, tensor)) {
                    const vocabSize = tensor.shape[0];
                    const embeddingDim = tensor.shape[1] || tensor.shape[0];

                    const pattern = {
                        id: `emb_${model.id}_${name}_${Date.now()}`,
                        category: 'ml_embeddings',
                        categoryName: 'ML Embeddings',
                        parentCategory: 'data_science',
                        parentCategoryName: 'Data Science & Analytics',
                        parentIcon: '📊',
                        keywords: [
                            'embedding',
                            'vector',
                            'representation',
                            name.includes('token') ? 'token' : null,
                            name.includes('word') ? 'word' : null,
                            name.includes('position') ? 'positional' : null
                        ].filter(Boolean),
                        template: btoa(this.generateEmbeddingCode(name, tensor)),
                        confidence: 0.93,
                        intent: 'embedding_reference',
                        votes: 1,
                        embedding: this.createEmbeddingFromTensor(tensor),
                        sourceQuery: `Embedding layer ${name} from ${model.filename}`,
                        createdAt: new Date().toISOString(),
                        synthetic: false,
                        metadata: {
                            modelId: model.id,
                            modelFilename: model.filename,
                            tensorName: name,
                            vocabSize: vocabSize,
                            embeddingDim: embeddingDim,
                            dtype: tensor.dtype,
                            stats: tensor.stats
                        }
                    };

                    patterns.push(pattern);
                }
            }

            return patterns;
        },

        /**
         * Extract weight patterns (attention weights, layer weights, etc.)
         */
        extractWeightPatterns(model) {
            const patterns = [];

            for (const [name, tensor] of Object.entries(model.tensors)) {
                // Skip embeddings (already handled)
                if (this.isEmbeddingTensor(name, tensor)) continue;

                // Focus on key weight tensors
                if (name.includes('weight') || name.includes('kernel')) {
                    const weightType = this.classifyWeightTensor(name, tensor);

                    const pattern = {
                        id: `weight_${model.id}_${name}_${Date.now()}`,
                        category: 'ml_weights',
                        categoryName: 'ML Weights',
                        parentCategory: 'data_science',
                        parentCategoryName: 'Data Science & Analytics',
                        parentIcon: '📊',
                        keywords: [
                            'weights',
                            'parameters',
                            weightType,
                            name.includes('attention') ? 'attention' : null,
                            name.includes('mlp') ? 'feedforward' : null,
                            name.includes('query') ? 'query' : null,
                            name.includes('key') ? 'key' : null,
                            name.includes('value') ? 'value' : null
                        ].filter(Boolean),
                        template: btoa(this.generateWeightCode(name, tensor)),
                        confidence: 0.91,
                        intent: 'weight_reference',
                        votes: 1,
                        embedding: this.createWeightEmbedding(tensor),
                        sourceQuery: `${weightType} weights ${name} from ${model.filename}`,
                        createdAt: new Date().toISOString(),
                        synthetic: false,
                        metadata: {
                            modelId: model.id,
                            modelFilename: model.filename,
                            tensorName: name,
                            weightType: weightType,
                            shape: tensor.shape,
                            dtype: tensor.dtype,
                            stats: tensor.stats
                        }
                    };

                    patterns.push(pattern);
                }
            }

            return patterns;
        },

        /**
         * Group tensors by layer name
         */
        groupTensorsByLayer(tensors) {
            const groups = {};

            for (const [name, tensor] of Object.entries(tensors)) {
                // Extract layer identifier (e.g., "model.layers.0" from "model.layers.0.self_attn.q_proj.weight")
                const parts = name.split('.');
                const layerKey = parts.slice(0, Math.min(parts.length - 1, 3)).join('.');

                if (!groups[layerKey]) {
                    groups[layerKey] = [];
                }
                groups[layerKey].push({ name, ...tensor });
            }

            return groups;
        },

        /**
         * Detect layer type from name and tensors
         */
        detectLayerType(layerName, tensors) {
            const name = layerName.toLowerCase();

            if (name.includes('attention') || name.includes('attn')) return 'attention';
            if (name.includes('mlp') || name.includes('feed_forward')) return 'feedforward';
            if (name.includes('norm') || name.includes('layer_norm')) return 'normalization';
            if (name.includes('embed')) return 'embedding';
            if (name.includes('linear') || name.includes('dense')) return 'linear';
            if (name.includes('conv')) return 'convolution';
            if (name.includes('pool')) return 'pooling';

            return 'general';
        },

        /**
         * Check if tensor is an embedding
         */
        isEmbeddingTensor(name, tensor) {
            const nameCheck = name.toLowerCase().includes('embed') ||
                name.toLowerCase().includes('wte') ||
                name.toLowerCase().includes('wpe');
            const shapeCheck = tensor.shape.length === 2 && tensor.shape[0] > 100; // Vocab-like size

            return nameCheck && shapeCheck;
        },

        /**
         * Classify weight tensor type
         */
        classifyWeightTensor(name, tensor) {
            const lower = name.toLowerCase();

            if (lower.includes('q_proj') || lower.includes('query')) return 'query_projection';
            if (lower.includes('k_proj') || lower.includes('key')) return 'key_projection';
            if (lower.includes('v_proj') || lower.includes('value')) return 'value_projection';
            if (lower.includes('o_proj') || lower.includes('out')) return 'output_projection';
            if (lower.includes('gate') || lower.includes('up')) return 'gating';
            if (lower.includes('down')) return 'down_projection';

            return 'general_weight';
        },

        /**
         * Generate code template for architecture
         */
        generateArchitectureCode(layerName, tensors, layerType) {
            const tensorInfo = tensors.map(t =>
                `  ${t.name}: shape=${JSON.stringify(t.shape)}, dtype=${t.dtype}`
            ).join('\n');

            return `# ${layerType.toUpperCase()} Layer: ${layerName}
# Extracted from SafeTensor model

class ${layerType.charAt(0).toUpperCase() + layerType.slice(1)}Layer:
    """
    ${layerType} layer with ${tensors.length} tensors
    Total parameters: ${tensors.reduce((sum, t) => sum + t.size, 0).toLocaleString()}
    """
    
    def __init__(self):
        # Tensor shapes:
${tensorInfo}
        pass
    
    def forward(self, x):
        # TODO: Implement forward pass
        pass
`;
        },

        /**
         * Generate code for embedding layer
         */
        generateEmbeddingCode(name, tensor) {
            return `# Embedding Layer: ${name}
# Vocabulary size: ${tensor.shape[0]}
# Embedding dimension: ${tensor.shape[1] || tensor.shape[0]}

import torch.nn as nn

embedding = nn.Embedding(
    num_embeddings=${tensor.shape[0]},
    embedding_dim=${tensor.shape[1] || tensor.shape[0]},
    dtype=torch.${tensor.dtype.toLowerCase()}
)

# Statistics:
# Mean: ${tensor.stats.mean?.toFixed(4) || 'N/A'}
# Range: [${tensor.stats.min?.toFixed(4) || 'N/A'}, ${tensor.stats.max?.toFixed(4) || 'N/A'}]
# Total parameters: ${tensor.size.toLocaleString()}
`;
        },

        /**
         * Generate code for weight tensor
         */
        generateWeightCode(name, tensor) {
            return `# Weight Tensor: ${name}
# Shape: ${JSON.stringify(tensor.shape)}
# Data type: ${tensor.dtype}

import torch

weight = torch.zeros(${JSON.stringify(tensor.shape)}, dtype=torch.${tensor.dtype.toLowerCase()})

# Statistics:
${tensor.stats.mean !== undefined ? `# Mean: ${tensor.stats.mean.toFixed(4)}` : ''}
${tensor.stats.min !== undefined ? `# Min: ${tensor.stats.min.toFixed(4)}` : ''}
${tensor.stats.max !== undefined ? `# Max: ${tensor.stats.max.toFixed(4)}` : ''}
# Total elements: ${tensor.size.toLocaleString()}
`;
        },

        /**
         * Create embedding vector for architecture
         */
        createArchitectureEmbedding(tensors) {
            const embedding = new Array(128).fill(0);

            // Encode tensor count
            embedding[0] = Math.min(tensors.length / 10, 1);

            // Encode total parameters
            const totalParams = tensors.reduce((sum, t) => sum + t.size, 0);
            embedding[1] = Math.min(Math.log10(totalParams) / 10, 1);

            // Encode shape complexity
            tensors.forEach((t, idx) => {
                if (idx < 10) {
                    embedding[10 + idx] = t.shape.length / 4;
                }
            });

            return embedding;
        },

        /**
         * Create embedding from tensor data
         */
        createEmbeddingFromTensor(tensor) {
            const embedding = new Array(128).fill(0);

            if (tensor.stats.mean !== undefined) {
                embedding[0] = Math.tanh(tensor.stats.mean);
                embedding[1] = Math.min(tensor.stats.range, 10) / 10;
            }

            // Encode shape
            tensor.shape.forEach((dim, idx) => {
                if (idx < 4) {
                    embedding[10 + idx] = Math.min(Math.log10(dim) / 10, 1);
                }
            });

            return embedding;
        },

        /**
         * Create embedding from weight tensor
         */
        createWeightEmbedding(tensor) {
            return this.createEmbeddingFromTensor(tensor);
        },

        /**
         * Get model summary
         */
        getModelSummary(modelId) {
            const model = this.loadedModels[modelId];
            if (!model) return null;

            const layerGroups = this.groupTensorsByLayer(model.tensors);
            const totalParams = Object.values(model.tensors)
                .reduce((sum, t) => sum + t.size, 0);

            return {
                modelId: model.id,
                filename: model.filename,
                tensorCount: model.tensorCount,
                layerCount: Object.keys(layerGroups).length,
                totalParameters: totalParams,
                totalSize: model.totalSize,
                loadedAt: model.loadedAt,
                layers: Object.entries(layerGroups).map(([name, tensors]) => ({
                    name: name,
                    type: this.detectLayerType(name, tensors),
                    tensorCount: tensors.length,
                    parameters: tensors.reduce((sum, t) => sum + t.size, 0)
                }))
            };
        },

        /**
         * Export model information as JSON
         */
        exportModelInfo(modelId) {
            const summary = this.getModelSummary(modelId);
            if (!summary) return null;

            return {
                version: '1.0',
                exportedAt: new Date().toISOString(),
                model: summary,
                tensors: Object.entries(this.loadedModels[modelId].tensors).map(([name, tensor]) => ({
                    name: name,
                    dtype: tensor.dtype,
                    shape: tensor.shape,
                    size: tensor.size,
                    stats: tensor.stats
                }))
            };
        },

        /**
         * ============================================================
         * PARALLEL STREAMING LOADER - For Large Files (>100MB)
         * ============================================================
         */

        // Active workers pool
        activeWorkers: [],
        workerAborted: false,

        /**
         * Parse SafeTensor with parallel workers (for large files)
         */
        async parseSafeTensorParallel(arrayBuffer, filename, options = {}) {
            const fileSize = arrayBuffer.byteLength;
            const optimalConfig = this.getOptimalWorkerConfig(fileSize);

            // For small files, use regular parser
            if (optimalConfig.workers === 1) {
                console.log('📄 Small file detected, using single-threaded parser');
                return this.parseSafeTensor(arrayBuffer, filename);
            }

            console.log(`🚀 Using ${optimalConfig.workers} parallel workers for ${(fileSize / 1024 / 1024).toFixed(2)}MB file`);

            try {
                // Step 1: Parse header (single-threaded, fast)
                const headerInfo = await this.parseHeaderOnly(arrayBuffer);

                // Step 2: Distribute tensors across workers
                const tensorNames = Object.keys(headerInfo.metadata).filter(k => k !== '__metadata__');
                const workerAssignments = this.distributeTensors(tensorNames, optimalConfig.workers);

                // Step 3: Create worker pool and process in parallel
                const results = await this.processWithWorkers(
                    arrayBuffer,
                    workerAssignments,
                    headerInfo,
                    options.progressCallback
                );

                // Step 4: Merge results
                const tensors = Object.assign({}, ...results.map(r => r.tensors));

                const modelId = `model_${Date.now()}`;
                this.loadedModels[modelId] = {
                    id: modelId,
                    filename: filename,
                    metadata: headerInfo.metadata.__metadata__ || {},
                    tensors: tensors,
                    tensorCount: Object.keys(tensors).length,
                    totalSize: arrayBuffer.byteLength,
                    totalParameters: Object.values(tensors).reduce((sum, t) => sum + t.size, 0),
                    layerCount: Object.keys(this.groupTensorsByLayer(tensors)).length,
                    loadedAt: new Date().toISOString(),
                    loadMethod: 'parallel'
                };

                console.log(`✅ Parallel loading complete: ${Object.keys(tensors).length} tensors`);

                return {
                    success: true,
                    modelId: modelId,
                    model: this.loadedModels[modelId]
                };

            } catch (error) {
                console.error('❌ Parallel loading failed:', error);
                return {
                    success: false,
                    error: error.message
                };
            } finally {
                this.terminateWorkers();
            }
        },

        /**
         * Parse only the SafeTensor header
         */
        async parseHeaderOnly(arrayBuffer) {
            const view = new DataView(arrayBuffer);
            const headerLength = Number(view.getBigUint64(0, true));
            const metadataBytes = new Uint8Array(arrayBuffer, 8, headerLength);
            const metadataText = new TextDecoder().decode(metadataBytes);
            const metadata = JSON.parse(metadataText);
            const dataStart = 8 + headerLength;

            return { headerLength, metadata, dataStart };
        },

        /**
         * Get optimal worker configuration based on file size
         */
        getOptimalWorkerConfig(fileSize) {
            const hwConcurrency = navigator.hardwareConcurrency || 4;
            const mb = fileSize / (1024 * 1024);

            if (mb < 50) {
                return { workers: 1, chunkSize: fileSize };
            } else if (mb < 200) {
                return { workers: Math.min(2, hwConcurrency), chunkSize: 64 * 1024 * 1024 };
            } else if (mb < 1000) {
                return { workers: Math.min(4, hwConcurrency), chunkSize: 64 * 1024 * 1024 };
            } else {
                return { workers: Math.min(8, hwConcurrency), chunkSize: 64 * 1024 * 1024 };
            }
        },

        /**
         * Distribute tensors across workers evenly
         */
        distributeTensors(tensorNames, workerCount) {
            const assignments = Array.from({ length: workerCount }, () => []);

            // Round-robin distribution
            tensorNames.forEach((name, idx) => {
                const workerIdx = idx % workerCount;
                assignments[workerIdx].push(name);
            });

            return assignments;
        },

        /**
         * Process tensors with worker pool
         */
        async processWithWorkers(arrayBuffer, workerAssignments, headerInfo, progressCallback) {
            this.workerAborted = false;
            const workers = [];
            const workerPromises = [];

            // Create workers
            for (let i = 0; i < workerAssignments.length; i++) {
                if (workerAssignments[i].length === 0) continue;

                const worker = new Worker('safetensor_worker.js');
                workers.push({ worker, id: i, progress: 0 });

                const promise = new Promise((resolve, reject) => {
                    worker.onmessage = (event) => {
                        const { type, ...data } = event.data;

                        switch (type) {
                            case 'progress':
                                workers[i].progress = data.progress;
                                if (progressCallback) {
                                    const overall = workers.reduce((sum, w) => sum + (w.progress || 0), 0) / workers.length;
                                    progressCallback({
                                        workerId: data.workerId,
                                        workerProgress: data.progress,
                                        overallProgress: overall,
                                        processed: data.processed,
                                        total: data.total,
                                        workers: workers.map((w, idx) => ({
                                            id: idx,
                                            progress: w.progress || 0
                                        }))
                                    });
                                }
                                break;

                            case 'result':
                                if (data.subtype === 'tensors') {
                                    resolve(data.result);
                                }
                                break;

                            case 'error':
                                reject(new Error(data.error));
                                break;

                            case 'log':
                                console.log(`Worker ${data.workerId || i}:`, data.message);
                                break;
                        }
                    };

                    worker.onerror = (error) => {
                        reject(new Error(`Worker ${i} error: ${error.message}`));
                    };

                    // Send work to worker
                    // IMPORTANT: Do NOT transfer ArrayBuffer - multiple workers need access!
                    // Transferring would give ownership to first worker only
                    worker.postMessage({
                        type: 'parse_tensors',
                        payload: {
                            arrayBuffer: arrayBuffer,
                            tensorNames: workerAssignments[i],
                            metadata: headerInfo.metadata,
                            dataStart: headerInfo.dataStart,
                            workerId: i
                        }
                    });
                    // Note: ArrayBuffer is SHARED (cloned), not transferred
                });

                workerPromises.push(promise);
            }

            this.activeWorkers = workers;

            try {
                const results = await Promise.all(workerPromises);
                return results;
            } catch (error) {
                this.terminateWorkers();
                throw error;
            }
        },

        /**
         * Terminate all active workers
         */
        terminateWorkers() {
            this.activeWorkers.forEach(({ worker }) => worker.terminate());
            this.activeWorkers = [];
            this.workerAborted = false;
        },

        /**
         * Cancel ongoing parallel loading
         */
        cancelParallelLoading() {
            this.workerAborted = true;
            this.activeWorkers.forEach(({ worker }) => {
                worker.postMessage({ type: 'cancel' });
            });
            this.terminateWorkers();
        }
    };

    console.log('✅ SafeTensor Loader initialized');

})(window);
