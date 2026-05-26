/**
 * QuantumWeb API - JavaScript REST Interface
 * 
 * Exposes Quantum Web services: mesh network, entanglement distribution,
 * pattern sharing, and node management.
 */

// =========================================================================
// QUANTUM WEB DATA STRUCTURES
// =========================================================================

// Node states
const NODE_STATES = {
    ONLINE: 'online',
    OFFLINE: 'offline',
    SYNCING: 'syncing',
    PARTITIONED: 'partitioned'
};

// Pattern types
const PATTERN_TYPES = {
    GENOME: 'genome',
    STRATEGY: 'strategy',
    HISTORICAL: 'historical'
};

// In-memory stores
let meshNodes = new Map();
let entanglementPairs = new Map();
let patterns = [];
let patternValidations = [];

let nodeIdCounter = 0;
let pairIdCounter = 0;
let patternIdCounter = 0;

// =========================================================================
// MESH NETWORK MANAGEMENT
// =========================================================================

/**
 * Register a new mesh node
 */
function registerNode(name, endpoint, capabilities = {}) {
    const id = `node-${++nodeIdCounter}`;

    const node = {
        id,
        name,
        endpoint,
        state: NODE_STATES.ONLINE,
        capabilities: {
            eprRate: capabilities.eprRate || 1000,      // EPR pairs/sec
            fidelity: capabilities.fidelity || 0.95,
            maxDistance: capabilities.maxDistance || 100, // km
            qkdSupport: capabilities.qkdSupport !== false
        },
        peers: [],
        generation: 0,
        lastSeen: Date.now(),
        patternsShared: 0,
        patternsReceived: 0
    };

    meshNodes.set(id, node);
    console.log(`[QWeb] 🌐 Node registered: ${name} (${id})`);

    return node;
}

/**
 * Connect two nodes as peers
 */
function connectPeers(nodeId1, nodeId2) {
    const node1 = meshNodes.get(nodeId1);
    const node2 = meshNodes.get(nodeId2);

    if (!node1 || !node2) {
        return { error: 'One or both nodes not found' };
    }

    if (!node1.peers.includes(nodeId2)) {
        node1.peers.push(nodeId2);
    }
    if (!node2.peers.includes(nodeId1)) {
        node2.peers.push(nodeId1);
    }

    console.log(`[QWeb] 🔗 Peers connected: ${node1.name} ↔ ${node2.name}`);
    return { success: true, node1, node2 };
}

/**
 * List all mesh nodes
 */
function listNodes() {
    return Array.from(meshNodes.values());
}

/**
 * Get node by ID
 */
function getNode(nodeId) {
    return meshNodes.get(nodeId) || null;
}

/**
 * Update node state
 */
function updateNodeState(nodeId, state) {
    const node = meshNodes.get(nodeId);
    if (!node) return { error: 'Node not found' };

    node.state = state;
    node.lastSeen = Date.now();

    return { success: true, node };
}

// =========================================================================
// ENTANGLEMENT DISTRIBUTION
// =========================================================================

/**
 * Create entanglement pair between nodes
 */
function createEntanglementPair(nodeId1, nodeId2, fidelity = 0.95) {
    const node1 = meshNodes.get(nodeId1);
    const node2 = meshNodes.get(nodeId2);

    if (!node1 || !node2) {
        return { error: 'One or both nodes not found' };
    }

    const id = `epr-${++pairIdCounter}`;

    const pair = {
        id,
        nodes: [nodeId1, nodeId2],
        fidelity,
        state: 'active',    // active, consumed, decayed
        createdAt: Date.now(),
        bellState: 'Φ+',    // |Φ+⟩ = (|00⟩ + |11⟩)/√2
        correlations: {
            measuredAt: null,
            results: null
        }
    };

    entanglementPairs.set(id, pair);
    console.log(`[QWeb] ⚛️ EPR pair created: ${node1.name} ↔ ${node2.name} (F=${fidelity})`);

    return { success: true, pair };
}

/**
 * Consume entanglement pair (e.g., for teleportation)
 */
function consumeEntanglementPair(pairId, purpose = 'teleportation') {
    const pair = entanglementPairs.get(pairId);
    if (!pair) return { error: 'Pair not found' };

    if (pair.state !== 'active') {
        return { error: `Pair already ${pair.state}` };
    }

    pair.state = 'consumed';
    pair.consumedAt = Date.now();
    pair.purpose = purpose;

    // Simulate measurement
    pair.correlations.measuredAt = Date.now();
    pair.correlations.results = {
        node1: Math.random() > 0.5 ? 0 : 1,
        node2: null  // Correlated based on node1
    };
    pair.correlations.results.node2 = pair.correlations.results.node1;  // Perfect correlation in |Φ+⟩

    return { success: true, pair };
}

/**
 * List entanglement pairs
 */
function listEntanglementPairs(nodeId = null) {
    const pairs = Array.from(entanglementPairs.values());
    if (nodeId) {
        return pairs.filter(p => p.nodes.includes(nodeId));
    }
    return pairs;
}

// =========================================================================
// PATTERN SHARING (Collective Intelligence)
// =========================================================================

/**
 * Register a new pattern
 */
function registerPattern(sourceNodeId, type, data, fitnessImprovement = 0) {
    const node = meshNodes.get(sourceNodeId);
    if (!node) return { error: 'Source node not found' };

    const id = `pat-${++patternIdCounter}`;

    const pattern = {
        id,
        sourceNode: sourceNodeId,
        type,
        data,
        generation: node.generation,
        fitnessImprovement,
        discoveredAt: Date.now(),
        validations: [],
        status: 'pending'   // pending, validated, rejected
    };

    patterns.push(pattern);
    node.patternsShared++;
    node.generation++;

    console.log(`[QWeb] 📊 Pattern registered: ${type} from ${node.name} (improvement: ${(fitnessImprovement * 100).toFixed(1)}%)`);

    return { success: true, pattern };
}

/**
 * Validate pattern from another node
 */
function validatePattern(patternId, validatorNodeId, confidence) {
    const pattern = patterns.find(p => p.id === patternId);
    if (!pattern) return { error: 'Pattern not found' };

    const validator = meshNodes.get(validatorNodeId);
    if (!validator) return { error: 'Validator node not found' };

    const validation = {
        nodeId: validatorNodeId,
        confidence,
        timestamp: Date.now()
    };

    pattern.validations.push(validation);
    validator.patternsReceived++;

    // Check if pattern is validated (confidence > 0.7 from majority)
    const validCount = pattern.validations.filter(v => v.confidence > 0.7).length;
    const totalNodes = meshNodes.size;

    if (validCount >= Math.ceil(totalNodes / 2)) {
        pattern.status = 'validated';
    } else if (pattern.validations.length >= totalNodes * 0.8 && validCount < totalNodes / 4) {
        pattern.status = 'rejected';
    }

    return { success: true, pattern, validation };
}

/**
 * Get patterns for a node (to sync)
 */
function getPatternsSinceGeneration(generation) {
    return patterns.filter(p => p.generation > generation && p.status === 'validated');
}

/**
 * List all patterns
 */
function listPatterns(status = null) {
    if (status) {
        return patterns.filter(p => p.status === status);
    }
    return patterns;
}

// =========================================================================
// MESH NETWORK TOPOLOGY
// =========================================================================

/**
 * Get network topology
 */
function getTopology() {
    const nodes = listNodes();
    const edges = [];

    nodes.forEach(node => {
        node.peers.forEach(peerId => {
            // Avoid duplicates
            if (node.id < peerId) {
                edges.push({
                    from: node.id,
                    to: peerId,
                    fromName: node.name,
                    toName: meshNodes.get(peerId)?.name || 'Unknown'
                });
            }
        });
    });

    return {
        nodes: nodes.map(n => ({
            id: n.id,
            name: n.name,
            state: n.state,
            peers: n.peers.length
        })),
        edges,
        stats: {
            totalNodes: nodes.length,
            onlineNodes: nodes.filter(n => n.state === NODE_STATES.ONLINE).length,
            totalEdges: edges.length,
            avgConnectivity: nodes.length > 0 ? (edges.length * 2 / nodes.length).toFixed(2) : 0
        }
    };
}

/**
 * Simulate partition (node goes offline)
 */
function simulatePartition(nodeId) {
    const node = meshNodes.get(nodeId);
    if (!node) return { error: 'Node not found' };

    node.state = NODE_STATES.PARTITIONED;
    node.partitionedAt = Date.now();

    return { success: true, node, message: `Node ${node.name} is now partitioned` };
}

/**
 * Rejoin after partition
 */
function rejoinFromPartition(nodeId) {
    const node = meshNodes.get(nodeId);
    if (!node) return { error: 'Node not found' };

    if (node.state !== NODE_STATES.PARTITIONED) {
        return { error: 'Node is not partitioned' };
    }

    node.state = NODE_STATES.SYNCING;

    // Get patterns missed during partition
    const missedPatterns = getPatternsSinceGeneration(node.generation);

    node.state = NODE_STATES.ONLINE;
    node.lastSeen = Date.now();

    return {
        success: true,
        node,
        missedPatterns: missedPatterns.length,
        patternsSynced: missedPatterns.map(p => p.id)
    };
}

// =========================================================================
// QUANTUM WEB STATISTICS
// =========================================================================

/**
 * Get QuantumWeb stats
 */
function getWebStats() {
    const nodes = listNodes();
    const pairs = listEntanglementPairs();
    const validatedPatterns = patterns.filter(p => p.status === 'validated');

    return {
        mesh: {
            totalNodes: nodes.length,
            onlineNodes: nodes.filter(n => n.state === NODE_STATES.ONLINE).length,
            partitionedNodes: nodes.filter(n => n.state === NODE_STATES.PARTITIONED).length,
            totalConnections: nodes.reduce((sum, n) => sum + n.peers.length, 0) / 2
        },
        entanglement: {
            activePairs: pairs.filter(p => p.state === 'active').length,
            consumedPairs: pairs.filter(p => p.state === 'consumed').length,
            avgFidelity: pairs.length > 0
                ? (pairs.reduce((sum, p) => sum + p.fidelity, 0) / pairs.length).toFixed(3)
                : 0
        },
        patterns: {
            total: patterns.length,
            validated: validatedPatterns.length,
            pending: patterns.filter(p => p.status === 'pending').length,
            rejected: patterns.filter(p => p.status === 'rejected').length,
            avgFitnessImprovement: validatedPatterns.length > 0
                ? (validatedPatterns.reduce((sum, p) => sum + p.fitnessImprovement, 0) / validatedPatterns.length * 100).toFixed(1) + '%'
                : '0%'
        },
        collective: {
            totalPatternsShared: nodes.reduce((sum, n) => sum + n.patternsShared, 0),
            totalGenerations: nodes.reduce((sum, n) => sum + n.generation, 0)
        }
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    // Constants
    NODE_STATES,
    PATTERN_TYPES,

    // Mesh nodes
    registerNode,
    connectPeers,
    listNodes,
    getNode,
    updateNodeState,

    // Entanglement
    createEntanglementPair,
    consumeEntanglementPair,
    listEntanglementPairs,

    // Patterns
    registerPattern,
    validatePattern,
    getPatternsSinceGeneration,
    listPatterns,

    // Topology
    getTopology,
    simulatePartition,
    rejoinFromPartition,

    // Stats
    getWebStats
};
