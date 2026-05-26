/**
 * Semantic Pattern Extractor for SafeTensor Models
 * Analyzes meaning, relationships, and functional roles beyond structure
 * Dramatically increases pattern variation through semantic understanding
 */

(function (window) {
    'use strict';

    window.SemanticExtractor = {
        // Semantic pattern database
        semanticPatterns: [],

        // Design pattern templates
        designPatterns: {
            residual: {
                indicators: ['residual', 'skip', 'shortcut', 'add'],
                role: 'gradient_flow',
                description: 'Enables direct gradient flow through identity connections'
            },
            bottleneck: {
                indicators: ['down', 'up', 'bottleneck', 'compress'],
                role: 'dimensionality_reduction',
                description: 'Reduces and expands dimensions for computational efficiency'
            },
            gating: {
                indicators: ['gate', 'sigmoid', 'glu', 'swiglu'],
                role: 'selective_information',
                description: 'Controls information flow through learned gates'
            },
            multihead: {
                indicators: ['multi_head', 'num_heads', 'head_dim'],
                role: 'parallel_attention',
                description: 'Processes multiple representation subspaces in parallel'
            },
            cross_attention: {
                indicators: ['cross_attn', 'encoder_decoder', 'cross'],
                role: 'conditional_processing',
                description: 'Conditions on external context or different modality'
            },
            layernorm: {
                indicators: ['layer_norm', 'ln', 'norm'],
                role: 'stabilization',
                description: 'Normalizes activations for training stability'
            },
            dropout: {
                indicators: ['dropout', 'drop'],
                role: 'regularization',
                description: 'Prevents overfitting through random dropout'
            },
            positional: {
                indicators: ['position', 'pos_emb', 'rope', 'alibi'],
                role: 'sequence_awareness',
                description: 'Encodes positional information in sequences'
            }
        },

        // Functional roles taxonomy
        functionalRoles: {
            'representation_learning': ['embed', 'encoder', 'representation'],
            'attention_mechanism': ['attention', 'attn', 'query', 'key', 'value'],
            'feature_transformation': ['linear', 'dense', 'projection', 'fc'],
            'nonlinear_activation': ['gelu', 'relu', 'silu', 'swish', 'activation'],
            'normalization': ['norm', 'batch_norm', 'layer_norm', 'rms'],
            'information_routing': ['gate', 'router', 'moe', 'expert'],
            'dimension_manipulation': ['reshape', 'transpose', 'permute', 'view'],
            'aggregation': ['pool', 'mean', 'max', 'sum', 'aggregate'],
            'generation': ['decoder', 'lm_head', 'output', 'predict'],
            'conditioning': ['condition', 'context', 'cross', 'fusion']
        },

        /**
         * Main semantic extraction function
         */
        async extractSemanticPatterns(model, options = {}) {
            console.log('🧠 Starting semantic extraction...');

            const semanticPatterns = [];

            // 1. Analyze layer relationships and connectivity
            const connectivity = this.analyzeConnectivity(model);

            // 2. Detect design patterns
            const designPatternInstances = this.detectDesignPatterns(model, connectivity);
            semanticPatterns.push(...designPatternInstances);

            // 3. Infer functional roles
            const functionalPatterns = this.inferFunctionalRoles(model);
            semanticPatterns.push(...functionalPatterns);

            // 4. Analyze information flow
            const flowPatterns = this.analyzeInformationFlow(model, connectivity);
            semanticPatterns.push(...flowPatterns);

            // 5. Cluster semantically similar components
            const clusterPatterns = this.clusterSemanticComponents(model);
            semanticPatterns.push(...clusterPatterns);

            // 6. Analyze learned features from weights
            const featurePatterns = this.analyzeLearnedFeatures(model);
            semanticPatterns.push(...featurePatterns);

            // 7. Detect architectural motifs
            const motifPatterns = this.detectArchitecturalMotifs(model);
            semanticPatterns.push(...motifPatterns);

            // 8. Generate conceptual variations
            const variationPatterns = this.generateConceptualVariations(semanticPatterns);
            semanticPatterns.push(...variationPatterns);

            this.semanticPatterns = semanticPatterns;

            console.log(`✅ Extracted ${semanticPatterns.length} semantic patterns`);

            return {
                success: true,
                totalPatterns: semanticPatterns.length,
                patterns: semanticPatterns,
                breakdown: {
                    designPatterns: designPatternInstances.length,
                    functionalRoles: functionalPatterns.length,
                    informationFlow: flowPatterns.length,
                    semanticClusters: clusterPatterns.length,
                    learnedFeatures: featurePatterns.length,
                    architecturalMotifs: motifPatterns.length,
                    conceptualVariations: variationPatterns.length
                }
            };
        },

        /**
         * Analyze layer connectivity and relationships
         */
        analyzeConnectivity(model) {
            const connectivity = {
                graph: {},
                dependencies: {},
                flowPaths: []
            };

            const tensors = Object.entries(model.tensors);

            // Build connectivity graph
            tensors.forEach(([name, tensor]) => {
                const layerPath = this.extractLayerPath(name);

                if (!connectivity.graph[layerPath]) {
                    connectivity.graph[layerPath] = {
                        inputs: [],
                        outputs: [],
                        tensors: [],
                        role: this.inferLayerRole(name)
                    };
                }

                connectivity.graph[layerPath].tensors.push(name);
            });

            // Detect flow patterns (attention -> norm -> ffn -> norm)
            const layerKeys = Object.keys(connectivity.graph).sort();
            for (let i = 0; i < layerKeys.length - 1; i++) {
                const current = layerKeys[i];
                const next = layerKeys[i + 1];

                if (this.areConnected(current, next)) {
                    connectivity.graph[current].outputs.push(next);
                    connectivity.graph[next].inputs.push(current);
                }
            }

            // Identify flow paths (e.g., encoder->decoder, attention->mlp)
            connectivity.flowPaths = this.identifyFlowPaths(connectivity.graph);

            return connectivity;
        },

        /**
         * Detect design patterns in the model
         */
        detectDesignPatterns(model, connectivity) {
            const patterns = [];

            for (const [patternName, patternDef] of Object.entries(this.designPatterns)) {
                const instances = this.findPatternInstances(model, patternDef);

                instances.forEach((instance, idx) => {
                    const pattern = {
                        id: `semantic_design_${patternName}_${idx}_${Date.now()}`,
                        category: 'semantic_design_pattern',
                        categoryName: `Design Pattern: ${patternName}`,
                        parentCategory: 'data_science',
                        parentCategoryName: 'Data Science & Analytics',
                        parentIcon: '📊',
                        keywords: [
                            'design_pattern',
                            patternName,
                            patternDef.role,
                            ...patternDef.indicators,
                            'semantic'
                        ],
                        template: btoa(this.generateDesignPatternCode(patternName, instance)),
                        confidence: 0.96,
                        intent: 'design_pattern_reference',
                        votes: 1,
                        embedding: this.createSemanticEmbedding([patternName, patternDef.role]),
                        sourceQuery: `${patternName} design pattern in ${model.filename}`,
                        createdAt: new Date().toISOString(),
                        synthetic: false,
                        semanticType: 'design_pattern',
                        metadata: {
                            modelId: model.id,
                            modelFilename: model.filename,
                            patternName: patternName,
                            role: patternDef.role,
                            description: patternDef.description,
                            instance: instance,
                            semanticAnalysis: {
                                purpose: patternDef.description,
                                benefits: this.getPatternBenefits(patternName),
                                useCases: this.getPatternUseCases(patternName)
                            }
                        }
                    };

                    patterns.push(pattern);
                });
            }

            return patterns;
        },

        /**
         * Infer functional roles of layers
         */
        inferFunctionalRoles(model) {
            const patterns = [];
            const tensorGroups = this.groupTensorsByFunction(model.tensors);

            for (const [role, tensors] of Object.entries(tensorGroups)) {
                if (tensors.length === 0) continue;

                // Create a pattern for each functional role group
                const pattern = {
                    id: `semantic_role_${role}_${Date.now()}`,
                    category: 'semantic_functional_role',
                    categoryName: `Functional Role: ${role.replace(/_/g, ' ')}`,
                    parentCategory: 'data_science',
                    parentCategoryName: 'Data Science & Analytics',
                    parentIcon: '📊',
                    keywords: [
                        'functional_role',
                        role,
                        'semantic',
                        ...tensors[0].name.split('.').slice(0, 3)
                    ],
                    template: btoa(this.generateFunctionalRoleCode(role, tensors)),
                    confidence: 0.94,
                    intent: 'functional_understanding',
                    votes: 1,
                    embedding: this.createSemanticEmbedding([role, 'function']),
                    sourceQuery: `${role.replace(/_/g, ' ')} components in ${model.filename}`,
                    createdAt: new Date().toISOString(),
                    synthetic: false,
                    semanticType: 'functional_role',
                    metadata: {
                        modelId: model.id,
                        modelFilename: model.filename,
                        functionalRole: role,
                        componentCount: tensors.length,
                        components: tensors.map(t => ({
                            name: t.name,
                            shape: t.shape,
                            parameters: t.size
                        })),
                        semanticAnalysis: {
                            purpose: this.getRolePurpose(role),
                            inputType: this.getRoleInputType(role),
                            outputType: this.getRoleOutputType(role),
                            commonUses: this.getRoleCommonUses(role)
                        }
                    }
                };

                patterns.push(pattern);
            }

            return patterns;
        },

        /**
         * Analyze information flow through the network
         */
        analyzeInformationFlow(model, connectivity) {
            const patterns = [];

            // Identify major flow paths
            connectivity.flowPaths.forEach((path, idx) => {
                const flowType = this.classifyFlowPath(path);

                const pattern = {
                    id: `semantic_flow_${flowType}_${idx}_${Date.now()}`,
                    category: 'semantic_information_flow',
                    categoryName: `Information Flow: ${flowType}`,
                    parentCategory: 'data_science',
                    parentCategoryName: 'Data Science & Analytics',
                    parentIcon: '📊',
                    keywords: [
                        'information_flow',
                        flowType,
                        'dataflow',
                        'pipeline',
                        'semantic'
                    ],
                    template: btoa(this.generateFlowCode(flowType, path)),
                    confidence: 0.93,
                    intent: 'flow_understanding',
                    votes: 1,
                    embedding: this.createSemanticEmbedding([flowType, 'flow']),
                    sourceQuery: `${flowType} information flow in ${model.filename}`,
                    createdAt: new Date().toISOString(),
                    synthetic: false,
                    semanticType: 'information_flow',
                    metadata: {
                        modelId: model.id,
                        modelFilename: model.filename,
                        flowType: flowType,
                        pathLength: path.length,
                        path: path,
                        semanticAnalysis: {
                            dataTransformation: this.analyzeTransformations(path),
                            bottlenecks: this.identifyBottlenecks(path),
                            parallelPaths: this.findParallelPaths(path, connectivity),
                            flowCharacteristics: this.getFlowCharacteristics(flowType)
                        }
                    }
                };

                patterns.push(pattern);
            });

            return patterns;
        },

        /**
         * Cluster semantically similar components
         */
        clusterSemanticComponents(model) {
            const patterns = [];
            const tensors = Object.values(model.tensors);

            // Create semantic embeddings for each tensor
            const tensorEmbeddings = tensors.map(t => ({
                tensor: t,
                embedding: this.createTensorSemanticEmbedding(t)
            }));

            // Perform hierarchical clustering
            const clusters = this.hierarchicalClustering(tensorEmbeddings, 0.7);

            clusters.forEach((cluster, idx) => {
                if (cluster.members.length < 2) return;

                const clusterTheme = this.inferClusterTheme(cluster.members);

                const pattern = {
                    id: `semantic_cluster_${idx}_${Date.now()}`,
                    category: 'semantic_cluster',
                    categoryName: `Semantic Cluster: ${clusterTheme}`,
                    parentCategory: 'data_science',
                    parentCategoryName: 'Data Science & Analytics',
                    parentIcon: '📊',
                    keywords: [
                        'semantic_cluster',
                        clusterTheme,
                        'similarity',
                        'grouping'
                    ],
                    template: btoa(this.generateClusterCode(clusterTheme, cluster)),
                    confidence: 0.91,
                    intent: 'conceptual_grouping',
                    votes: 1,
                    embedding: this.createSemanticEmbedding([clusterTheme, 'cluster']),
                    sourceQuery: `${clusterTheme} semantic cluster in ${model.filename}`,
                    createdAt: new Date().toISOString(),
                    synthetic: false,
                    semanticType: 'semantic_cluster',
                    metadata: {
                        modelId: model.id,
                        modelFilename: model.filename,
                        clusterTheme: clusterTheme,
                        memberCount: cluster.members.length,
                        cohesion: cluster.cohesion,
                        members: cluster.members.map(m => ({
                            name: m.tensor.name,
                            shape: m.tensor.shape
                        })),
                        semanticAnalysis: {
                            commonality: this.analyzeCommonality(cluster.members),
                            diversity: this.analyzeDiversity(cluster.members),
                            representativeExample: cluster.members[0].tensor.name
                        }
                    }
                };

                patterns.push(pattern);
            });

            return patterns;
        },

        /**
         * Analyze learned features from weight distributions
         */
        analyzeLearnedFeatures(model) {
            const patterns = [];

            for (const [name, tensor] of Object.entries(model.tensors)) {
                // Focus on weight tensors with interesting distributions
                if (!name.includes('weight') || !tensor.stats.mean) continue;

                const features = this.detectLearnedFeatures(tensor);

                if (features.significant) {
                    const pattern = {
                        id: `semantic_learned_${name}_${Date.now()}`,
                        category: 'semantic_learned_feature',
                        categoryName: `Learned Feature: ${features.type}`,
                        parentCategory: 'data_science',
                        parentCategoryName: 'Data Science & Analytics',
                        parentIcon: '📊',
                        keywords: [
                            'learned_feature',
                            features.type,
                            'training',
                            'adaptation',
                            'semantic'
                        ],
                        template: btoa(this.generateLearnedFeatureCode(name, features)),
                        confidence: 0.89,
                        intent: 'learned_pattern',
                        votes: 1,
                        embedding: this.createSemanticEmbedding([features.type, 'learned']),
                        sourceQuery: `${features.type} learned feature in ${model.filename}`,
                        createdAt: new Date().toISOString(),
                        synthetic: false,
                        semanticType: 'learned_feature',
                        metadata: {
                            modelId: model.id,
                            modelFilename: model.filename,
                            tensorName: name,
                            featureType: features.type,
                            featureStrength: features.strength,
                            statistics: tensor.stats,
                            semanticAnalysis: {
                                interpretation: features.interpretation,
                                trainingSignal: features.trainingSignal,
                                adaptiveCapability: features.adaptiveCapability
                            }
                        }
                    };

                    patterns.push(pattern);
                }
            }

            return patterns;
        },

        /**
         * Detect architectural motifs (repeated patterns)
         */
        detectArchitecturalMotifs(model) {
            const patterns = [];
            const layerGroups = this.groupLayersByStructure(model.tensors);

            // Find repeated motifs
            const motifs = this.findRepeatedMotifs(layerGroups);

            motifs.forEach((motif, idx) => {
                const pattern = {
                    id: `semantic_motif_${motif.type}_${idx}_${Date.now()}`,
                    category: 'semantic_architectural_motif',
                    categoryName: `Architectural Motif: ${motif.type}`,
                    parentCategory: 'data_science',
                    parentCategoryName: 'Data Science & Analytics',
                    parentIcon: '📊',
                    keywords: [
                        'architectural_motif',
                        motif.type,
                        'repeated_pattern',
                        'structure',
                        'semantic'
                    ],
                    template: btoa(this.generateMotifCode(motif)),
                    confidence: 0.95,
                    intent: 'architectural_understanding',
                    votes: 1,
                    embedding: this.createSemanticEmbedding([motif.type, 'motif']),
                    sourceQuery: `${motif.type} architectural motif in ${model.filename}`,
                    createdAt: new Date().toISOString(),
                    synthetic: false,
                    semanticType: 'architectural_motif',
                    metadata: {
                        modelId: model.id,
                        modelFilename: model.filename,
                        motifType: motif.type,
                        occurrences: motif.count,
                        layerPattern: motif.pattern,
                        semanticAnalysis: {
                            designIntent: this.inferDesignIntent(motif),
                            scalabilityImpact: this.analyzeScalability(motif),
                            performanceImplications: this.analyzePerformance(motif)
                        }
                    }
                };

                patterns.push(pattern);
            });

            return patterns;
        },

        /**
         * Generate conceptual variations of patterns
         */
        generateConceptualVariations(basePatterns) {
            const variations = [];

            // Group patterns by semantic similarity
            const groups = this.groupBySemanticSimilarity(basePatterns);

            groups.forEach(group => {
                // Generate variations for each group
                const groupVariations = this.createVariations(group);
                variations.push(...groupVariations);
            });

            return variations;
        },

        // ============================================
        // Helper Functions
        // ============================================

        extractLayerPath(tensorName) {
            const parts = tensorName.split('.');
            return parts.slice(0, Math.min(parts.length - 1, 4)).join('.');
        },

        inferLayerRole(name) {
            const lower = name.toLowerCase();

            for (const [role, indicators] of Object.entries(this.functionalRoles)) {
                if (indicators.some(ind => lower.includes(ind))) {
                    return role;
                }
            }

            return 'unknown';
        },

        areConnected(layer1, layer2) {
            // Simple heuristic: layers are connected if they're sequential
            const num1 = parseInt(layer1.match(/\d+/)?.[0] || 0);
            const num2 = parseInt(layer2.match(/\d+/)?.[0] || 0);
            return Math.abs(num1 - num2) <= 1;
        },

        identifyFlowPaths(graph) {
            const paths = [];
            const visited = new Set();

            const dfs = (node, path) => {
                if (visited.has(node)) return;
                visited.add(node);
                path.push(node);

                const outputs = graph[node]?.outputs || [];
                if (outputs.length === 0) {
                    if (path.length > 2) {
                        paths.push([...path]);
                    }
                } else {
                    outputs.forEach(output => dfs(output, path));
                }

                path.pop();
            };

            Object.keys(graph).forEach(node => {
                if (graph[node].inputs.length === 0) {
                    dfs(node, []);
                }
            });

            return paths;
        },

        findPatternInstances(model, patternDef) {
            const instances = [];

            for (const [name, tensor] of Object.entries(model.tensors)) {
                const nameLower = name.toLowerCase();
                const hasIndicator = patternDef.indicators.some(ind =>
                    nameLower.includes(ind)
                );

                if (hasIndicator) {
                    instances.push({
                        tensorName: name,
                        tensor: tensor,
                        indicators: patternDef.indicators.filter(ind => nameLower.includes(ind))
                    });
                }
            }

            return instances;
        },

        groupTensorsByFunction(tensors) {
            const groups = {};

            for (const role of Object.keys(this.functionalRoles)) {
                groups[role] = [];
            }

            for (const [name, tensor] of Object.entries(tensors)) {
                const role = this.inferLayerRole(name);
                if (groups[role]) {
                    groups[role].push({ name, ...tensor });
                }
            }

            return groups;
        },

        classifyFlowPath(path) {
            const pathStr = path.join('->').toLowerCase();

            if (pathStr.includes('encoder') && pathStr.includes('decoder')) return 'encoder_decoder';
            if (pathStr.includes('attention') && pathStr.includes('mlp')) return 'attention_feedforward';
            if (pathStr.includes('down') && pathStr.includes('up')) return 'bottleneck_flow';
            if (pathStr.includes('cross')) return 'cross_modal';

            return 'sequential_flow';
        },

        createTensorSemanticEmbedding(tensor) {
            const embedding = new Array(256).fill(0);

            // Encode shape signature
            tensor.shape.forEach((dim, idx) => {
                if (idx < 4) {
                    embedding[idx * 10] = Math.log10(dim + 1) / 10;
                }
            });

            // Encode statistics
            if (tensor.stats.mean !== undefined) {
                embedding[40] = Math.tanh(tensor.stats.mean * 10);
                embedding[41] = Math.min(tensor.stats.range / 10, 1);
            }

            // Encode name semantics
            const nameWords = tensor.name.toLowerCase().split(/[._]/);
            nameWords.forEach((word, idx) => {
                if (idx < 20) {
                    let hash = 0;
                    for (let i = 0; i < word.length; i++) {
                        hash = ((hash << 5) - hash) + word.charCodeAt(i);
                    }
                    embedding[50 + idx] = (hash % 1000) / 1000;
                }
            });

            return embedding;
        },

        hierarchicalClustering(items, threshold) {
            const clusters = [];
            const used = new Set();

            for (let i = 0; i < items.length; i++) {
                if (used.has(i)) continue;

                const cluster = {
                    members: [items[i]],
                    centroid: [...items[i].embedding],
                    cohesion: 1.0
                };

                for (let j = i + 1; j < items.length; j++) {
                    if (used.has(j)) continue;

                    const similarity = this.cosineSimilarity(
                        cluster.centroid,
                        items[j].embedding
                    );

                    if (similarity > threshold) {
                        cluster.members.push(items[j]);
                        used.add(j);

                        // Update centroid
                        for (let k = 0; k < cluster.centroid.length; k++) {
                            cluster.centroid[k] = (cluster.centroid[k] + items[j].embedding[k]) / 2;
                        }
                    }
                }

                used.add(i);
                clusters.push(cluster);
            }

            return clusters;
        },

        cosineSimilarity(e1, e2) {
            let dot = 0, mag1 = 0, mag2 = 0;
            for (let i = 0; i < e1.length; i++) {
                dot += e1[i] * e2[i];
                mag1 += e1[i] * e1[i];
                mag2 += e2[i] * e2[i];
            }
            return dot / (Math.sqrt(mag1) * Math.sqrt(mag2));
        },

        inferClusterTheme(members) {
            const names = members.map(m => m.tensor.name);
            const commonWords = this.findCommonWords(names);

            if (commonWords.length > 0) {
                return commonWords[0].replace(/_/g, ' ');
            }

            return 'similar_components';
        },

        findCommonWords(names) {
            const wordCounts = {};

            names.forEach(name => {
                const words = name.toLowerCase().split(/[._]/);
                words.forEach(word => {
                    if (word.length > 2) {
                        wordCounts[word] = (wordCounts[word] || 0) + 1;
                    }
                });
            });

            return Object.entries(wordCounts)
                .filter(([word, count]) => count > 1)
                .sort((a, b) => b[1] - a[1])
                .map(([word]) => word);
        },

        detectLearnedFeatures(tensor) {
            const stats = tensor.stats;
            if (!stats.mean) return { significant: false };

            // Analyze distribution characteristics
            const normalized = Math.abs(stats.mean) < 0.01;
            const sparse = stats.range > 1.0;
            const concentrated = stats.range < 0.1;

            let type = 'general';
            let interpretation = '';

            if (normalized && !sparse) {
                type = 'well_trained';
                interpretation = 'Well-trained weights with normalized distribution';
            } else if (sparse) {
                type = 'sparse_activation';
                interpretation = 'Sparse activation pattern, selective feature detection';
            } else if (concentrated) {
                type = 'specialized';
                interpretation = 'Specialized feature extraction with concentrated weights';
            }

            return {
                significant: true,
                type: type,
                interpretation: interpretation,
                strength: stats.range,
                trainingSignal: normalized ? 'strong' : 'moderate',
                adaptiveCapability: sparse ? 'high' : 'medium'
            };
        },

        groupLayersByStructure(tensors) {
            const groups = {};

            for (const [name, tensor] of Object.entries(tensors)) {
                const structure = this.getStructureSignature(tensor);
                if (!groups[structure]) {
                    groups[structure] = [];
                }
                groups[structure].push({ name, ...tensor });
            }

            return groups;
        },

        getStructureSignature(tensor) {
            return `${tensor.shape.join('x')}_${tensor.dtype}`;
        },

        findRepeatedMotifs(layerGroups) {
            const motifs = [];

            for (const [signature, layers] of Object.entries(layerGroups)) {
                if (layers.length > 3) {
                    motifs.push({
                        type: this.inferMotifType(layers),
                        pattern: signature,
                        count: layers.length,
                        layers: layers
                    });
                }
            }

            return motifs;
        },

        inferMotifType(layers) {
            const names = layers.map(l => l.name).join(' ');

            if (names.includes('attention')) return 'attention_block';
            if (names.includes('mlp') || names.includes('ffn')) return 'feedforward_block';
            if (names.includes('norm')) return 'normalization_layer';
            if (names.includes('linear')) return 'transformation_layer';

            return 'repeated_component';
        },

        createSemanticEmbedding(concepts) {
            const embedding = new Array(128).fill(0);

            concepts.forEach((concept, idx) => {
                let hash = 0;
                for (let i = 0; i < concept.length; i++) {
                    hash = ((hash << 5) - hash) + concept.charCodeAt(i);
                }
                const baseIdx = (Math.abs(hash) % 100) + (idx * 10);
                if (baseIdx < 128) {
                    embedding[baseIdx] = 0.8 + Math.random() * 0.2;
                }
            });

            return embedding;
        },

        // Code generation functions
        generateDesignPatternCode(patternName, instance) {
            return `# Design Pattern: ${patternName.toUpperCase()}
# ${this.designPatterns[patternName].description}

class ${patternName.charAt(0).toUpperCase() + patternName.slice(1)}Pattern:
    """
    Implements ${patternName} design pattern
    Role: ${this.designPatterns[patternName].role}
    
    Found in: ${instance.tensorName}
    """
    
    def __init__(self):
        # Pattern-specific implementation
        pass
    
    def forward(self, x):
        # ${this.designPatterns[patternName].description}
        return x
`;
        },

        generateFunctionalRoleCode(role, tensors) {
            return `# Functional Role: ${role.replace(/_/g, ' ').toUpperCase()}
# ${tensors.length} components with this role

class ${role.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}:
    """
    Purpose: ${this.getRolePurpose(role)}
    Components: ${tensors.length}
    """
    
    def __init__(self):
        # Initialize ${role} components
        pass
`;
        },

        generateFlowCode(flowType, path) {
            return `# Information Flow: ${flowType.toUpperCase()}
# Path length: ${path.length} layers

class ${flowType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Flow:
    """
    Flow pattern: ${path.join(' -> ')}
    """
    
    def forward(self, x):
        # Process through ${path.length} stages
        pass
`;
        },

        generateClusterCode(theme, cluster) {
            return `# Semantic Cluster: ${theme.toUpperCase()}
# ${cluster.members.length} similar components
# Cohesion: ${cluster.cohesion.toFixed(2)}

class ${theme.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Cluster:
    """
    Semantically related components sharing: ${theme}
    """
    pass
`;
        },

        generateLearnedFeatureCode(name, features) {
            return `# Learned Feature: ${features.type.toUpperCase()}
# ${features.interpretation}

# Feature characteristics:
# - Type: ${features.type}
# - Strength: ${features.strength.toFixed(4)}
# - Training signal: ${features.trainingSignal}
# - Adaptive capability: ${features.adaptiveCapability}
`;
        },

        generateMotifCode(motif) {
            return `# Architectural Motif: ${motif.type.toUpperCase()}
# Repeated ${motif.count} times throughout the model

class ${motif.type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Motif:
    """
    Structural pattern that appears ${motif.count} times
    Pattern: ${motif.pattern}
    """
    pass
`;
        },

        // Semantic analysis helpers
        getRolePurpose(role) {
            const purposes = {
                'representation_learning': 'Convert raw input to learnable representations',
                'attention_mechanism': 'Compute context-aware weighted combinations',
                'feature_transformation': 'Transform features across dimensions',
                'nonlinear_activation': 'Introduce non-linearity for complex patterns',
                'normalization': 'Stabilize training through normalization',
                'information_routing': 'Dynamically route information based on content',
                'dimension_manipulation': 'Reshape and permute tensor dimensions',
                'aggregation': 'Combine information from multiple sources',
                'generation': 'Generate output predictions or sequences',
                'conditioning': 'Condition processing on external context'
            };
            return purposes[role] || 'Process information';
        },

        getRoleInputType(role) {
            return role.includes('embed') ? 'discrete_tokens' : 'continuous_vectors';
        },

        getRoleOutputType(role) {
            return role.includes('generation') ? 'predictions' : 'transformed_features';
        },

        getRoleCommonUses(role) {
            return ['Neural architecture design', 'Transfer learning', 'Model interpretation'];
        },

        getPatternBenefits(patternName) {
            const benefits = {
                'residual': ['Easier gradient flow', 'Deeper networks', 'Better optimization'],
                'bottleneck': ['Reduced parameters', 'Faster inference', 'Regularization'],
                'gating': ['Selective processing', 'Dynamic routing', 'Improved capacity'],
                'multihead': ['Multiple perspectives', 'Parallel processing', 'Rich representations']
            };
            return benefits[patternName] || ['Design flexibility', 'Performance improvement'];
        },

        getPatternUseCases(patternName) {
            const useCases = {
                'residual': ['Deep CNNs', 'ResNet', 'Skip connections'],
                'bottleneck': ['Efficient transformers', 'Compressed models', 'Mobile networks'],
                'gating': ['LSTMs', 'GRUs', 'Mixture of experts'],
                'multihead': ['Transformers', 'Attention mechanisms', 'BERT']
            };
            return useCases[patternName] || ['General neural networks'];
        },

        analyzeTransformations(path) {
            return `Information transforms through ${path.length} stages`;
        },

        identifyBottlenecks(path) {
            return path.filter(p => p.includes('down') || p.includes('compress'));
        },

        findParallelPaths(path, connectivity) {
            return [];
        },

        getFlowCharacteristics(flowType) {
            return {
                complexity: 'medium',
                parallelism: 'sequential',
                depth: 'multi-stage'
            };
        },

        analyzeCommonality(members) {
            return 'Similar shapes and functional roles';
        },

        analyzeDiversity(members) {
            return members.length > 5 ? 'high' : 'medium';
        },

        inferDesignIntent(motif) {
            return 'Reusable structural component for scalability';
        },

        analyzeScalability(motif) {
            return 'Enables easy depth scaling through repetition';
        },

        analyzePerformance(motif) {
            return 'Consistent computational pattern across layers';
        },

        groupBySemanticSimilarity(patterns) {
            const groups = [];
            const used = new Set();

            for (let i = 0; i < patterns.length; i++) {
                if (used.has(i)) continue;

                const group = [patterns[i]];
                for (let j = i + 1; j < patterns.length; j++) {
                    if (used.has(j)) continue;

                    if (patterns[i].semanticType === patterns[j].semanticType) {
                        group.push(patterns[j]);
                        used.add(j);
                    }
                }

                used.add(i);
                if (group.length > 1) {
                    groups.push(group);
                }
            }

            return groups;
        },

        createVariations(group) {
            const variations = [];

            // Create conceptual variations by combining group members
            for (let i = 0; i < Math.min(group.length, 3); i++) {
                const base = group[i];

                const variation = {
                    ...base,
                    id: `semantic_variation_${base.id}_${Date.now()}`,
                    categoryName: `${base.categoryName} (Variation)`,
                    synthetic: true,
                    confidence: base.confidence * 0.95,
                    metadata: {
                        ...base.metadata,
                        isVariation: true,
                        basePattern: base.id,
                        variationReason: 'Conceptual recombination'
                    }
                };

                variations.push(variation);
            }

            return variations;
        }
    };

    console.log('✅ Semantic Extractor initialized');

})(window);
