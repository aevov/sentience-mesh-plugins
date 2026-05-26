/**
 * QuantumLambda API - JavaScript REST Interface
 * 
 * Serverless Quantum Functions: pay-per-shot execution, auto-scaling,
 * event triggers, circuit caching, and concurrent execution.
 */

// =========================================================================
// QUANTUM LAMBDA CONSTANTS
// =========================================================================

// Trigger types
const TRIGGER_TYPES = {
    HTTP: 'http',
    SCHEDULED: 'scheduled',
    QUEUE: 'queue',
    QUANTUM_STATE: 'quantum_state'
};

// Function states
const FUNCTION_STATES = {
    PENDING: 'pending',
    ACTIVE: 'active',
    DISABLED: 'disabled',
    ERROR: 'error'
};

// Pricing model
const PRICING = {
    basePerShot: 0.0001,        // $0.0001 per shot
    qubitMultiplier: 0.1,       // ×(qubits/10)
    perSecond: 0.01,            // $0.01 per second
    coldStartPenalty: 0.001     // $0.001 cold start overhead
};

// In-memory stores
let lambdaFunctions = new Map();
let invocations = [];
let triggers = new Map();
let circuitCache = new Map();

let functionIdCounter = 0;
let invocationIdCounter = 0;
let triggerIdCounter = 0;

// =========================================================================
// LAMBDA FUNCTION MANAGEMENT
// =========================================================================

/**
 * Create a new quantum lambda function
 */
function createFunction(name, circuit, options = {}) {
    const id = `qlambda-${++functionIdCounter}`;

    const func = {
        id,
        name,
        circuit,          // Circuit definition (array of gates)
        qubits: options.qubits || detectQubits(circuit),
        shots: options.shots || 1000,
        timeout: options.timeout || 30000,    // 30s default
        memory: options.memory || 256,         // MB
        state: FUNCTION_STATES.ACTIVE,
        triggers: [],
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        invocationCount: 0,
        totalCost: 0,
        coldStarts: 0,
        warmStarts: 0
    };

    lambdaFunctions.set(id, func);
    console.log(`[QLambda] ⚡ Function created: ${name} (${func.qubits} qubits)`);

    return func;
}

/**
 * Detect number of qubits from circuit
 */
function detectQubits(circuit) {
    if (!circuit || !circuit.length) return 1;

    let maxQubit = 0;
    circuit.forEach(gate => {
        if (Array.isArray(gate.qubits)) {
            maxQubit = Math.max(maxQubit, ...gate.qubits);
        } else if (typeof gate.qubits === 'number') {
            maxQubit = Math.max(maxQubit, gate.qubits);
        }
    });
    return maxQubit + 1;
}

/**
 * List all lambda functions
 */
function listFunctions(state = null) {
    const funcs = Array.from(lambdaFunctions.values());
    if (state) {
        return funcs.filter(f => f.state === state);
    }
    return funcs;
}

/**
 * Get function by ID
 */
function getFunction(functionId) {
    return lambdaFunctions.get(functionId) || null;
}

/**
 * Update function
 */
function updateFunction(functionId, updates) {
    const func = lambdaFunctions.get(functionId);
    if (!func) return { error: 'Function not found' };

    if (updates.circuit) func.circuit = updates.circuit;
    if (updates.shots) func.shots = updates.shots;
    if (updates.timeout) func.timeout = updates.timeout;
    if (updates.state) func.state = updates.state;

    func.version++;
    func.updatedAt = Date.now();

    return { success: true, function: func };
}

/**
 * Delete function
 */
function deleteFunction(functionId) {
    const func = lambdaFunctions.get(functionId);
    if (!func) return { error: 'Function not found' };

    lambdaFunctions.delete(functionId);
    return { success: true, deleted: functionId };
}

// =========================================================================
// INVOCATION
// =========================================================================

/**
 * Invoke a lambda function
 */
function invokeFunction(functionId, input = {}, async = false) {
    const func = lambdaFunctions.get(functionId);
    if (!func) return { error: 'Function not found' };
    if (func.state !== FUNCTION_STATES.ACTIVE) {
        return { error: `Function is ${func.state}` };
    }

    const invocationId = `inv-${++invocationIdCounter}`;
    const startTime = Date.now();

    // Check cache for warm start
    const cacheKey = JSON.stringify(func.circuit);
    const isColdStart = !circuitCache.has(cacheKey);

    if (isColdStart) {
        // Simulate circuit compilation
        circuitCache.set(cacheKey, {
            compiled: true,
            cachedAt: Date.now()
        });
        func.coldStarts++;
    } else {
        func.warmStarts++;
    }

    // Simulate execution
    const executionTime = isColdStart ? 0.5 + Math.random() * 0.5 : 0.1 + Math.random() * 0.2;

    // Generate simulated results
    const results = simulateQuantumExecution(func.circuit, func.qubits, func.shots);

    // Calculate cost
    const cost = calculateCost(func.qubits, func.shots, executionTime, isColdStart);

    const invocation = {
        id: invocationId,
        functionId,
        functionName: func.name,
        input,
        output: results,
        startTime,
        endTime: Date.now(),
        duration: executionTime * 1000,  // ms
        qubits: func.qubits,
        shots: func.shots,
        coldStart: isColdStart,
        cost,
        status: 'completed'
    };

    invocations.push(invocation);
    func.invocationCount++;
    func.totalCost += cost;

    console.log(`[QLambda] 🚀 Invoked ${func.name} (${isColdStart ? 'cold' : 'warm'} start, $${cost.toFixed(6)})`);

    return { success: true, invocation };
}

/**
 * Simulate quantum execution
 */
function simulateQuantumExecution(circuit, qubits, shots) {
    // Generate random measurement outcomes
    const outcomes = {};
    for (let i = 0; i < shots; i++) {
        const bits = Array(qubits).fill(0).map(() => Math.random() > 0.5 ? 1 : 0);
        const bitstring = bits.join('');
        outcomes[bitstring] = (outcomes[bitstring] || 0) + 1;
    }

    // Normalize and sort
    const sorted = Object.entries(outcomes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    return {
        counts: Object.fromEntries(sorted),
        shots,
        qubits,
        topResult: sorted[0]?.[0] || '0'.repeat(qubits)
    };
}

/**
 * Calculate invocation cost
 */
function calculateCost(qubits, shots, executionTime, isColdStart) {
    const shotCost = PRICING.basePerShot * shots * (qubits * PRICING.qubitMultiplier);
    const timeCost = PRICING.perSecond * executionTime;
    const coldCost = isColdStart ? PRICING.coldStartPenalty : 0;

    return shotCost + timeCost + coldCost;
}

/**
 * List invocations
 */
function listInvocations(functionId = null, limit = 50) {
    let inv = invocations;
    if (functionId) {
        inv = inv.filter(i => i.functionId === functionId);
    }
    return inv.slice(-limit).reverse();
}

// =========================================================================
// TRIGGERS
// =========================================================================

/**
 * Create trigger for function
 */
function createTrigger(functionId, type, config = {}) {
    const func = lambdaFunctions.get(functionId);
    if (!func) return { error: 'Function not found' };
    if (!TRIGGER_TYPES[type.toUpperCase()]) {
        return { error: `Invalid trigger type. Use: ${Object.values(TRIGGER_TYPES).join(', ')}` };
    }

    const id = `trigger-${++triggerIdCounter}`;

    const trigger = {
        id,
        functionId,
        type: type.toLowerCase(),
        config,
        enabled: true,
        createdAt: Date.now(),
        lastTriggered: null,
        triggerCount: 0
    };

    triggers.set(id, trigger);
    func.triggers.push(id);

    console.log(`[QLambda] 🎯 Trigger created: ${type} -> ${func.name}`);

    return { success: true, trigger };
}

/**
 * Fire a trigger
 */
function fireTrigger(triggerId, eventData = {}) {
    const trigger = triggers.get(triggerId);
    if (!trigger) return { error: 'Trigger not found' };
    if (!trigger.enabled) return { error: 'Trigger is disabled' };

    // Invoke the associated function
    const result = invokeFunction(trigger.functionId, eventData);

    trigger.lastTriggered = Date.now();
    trigger.triggerCount++;

    return {
        success: true,
        trigger,
        invocation: result.invocation
    };
}

/**
 * List triggers
 */
function listTriggers(functionId = null) {
    const trigs = Array.from(triggers.values());
    if (functionId) {
        return trigs.filter(t => t.functionId === functionId);
    }
    return trigs;
}

// =========================================================================
// STATS & BILLING
// =========================================================================

/**
 * Get Lambda stats
 */
function getLambdaStats() {
    const funcs = listFunctions();
    const invs = invocations;

    const totalCost = funcs.reduce((sum, f) => sum + f.totalCost, 0);
    const totalInvocations = funcs.reduce((sum, f) => sum + f.invocationCount, 0);
    const coldStarts = funcs.reduce((sum, f) => sum + f.coldStarts, 0);
    const warmStarts = funcs.reduce((sum, f) => sum + f.warmStarts, 0);

    return {
        functions: {
            total: funcs.length,
            active: funcs.filter(f => f.state === FUNCTION_STATES.ACTIVE).length
        },
        invocations: {
            total: totalInvocations,
            recent: invs.slice(-100).length
        },
        performance: {
            coldStarts,
            warmStarts,
            warmRatio: warmStarts / (coldStarts + warmStarts) || 0
        },
        billing: {
            totalCost: totalCost.toFixed(4),
            avgCostPerInvocation: (totalCost / totalInvocations || 0).toFixed(6)
        },
        triggers: {
            total: triggers.size,
            byType: {
                http: Array.from(triggers.values()).filter(t => t.type === 'http').length,
                scheduled: Array.from(triggers.values()).filter(t => t.type === 'scheduled').length,
                queue: Array.from(triggers.values()).filter(t => t.type === 'queue').length,
                quantum_state: Array.from(triggers.values()).filter(t => t.type === 'quantum_state').length
            }
        }
    };
}

/**
 * Get function billing details
 */
function getFunctionBilling(functionId) {
    const func = lambdaFunctions.get(functionId);
    if (!func) return { error: 'Function not found' };

    const funcInvocations = invocations.filter(i => i.functionId === functionId);
    const costBreakdown = funcInvocations.reduce((acc, inv) => {
        acc.shotCost += PRICING.basePerShot * inv.shots * (inv.qubits * PRICING.qubitMultiplier);
        acc.timeCost += PRICING.perSecond * (inv.duration / 1000);
        acc.coldCost += inv.coldStart ? PRICING.coldStartPenalty : 0;
        return acc;
    }, { shotCost: 0, timeCost: 0, coldCost: 0 });

    return {
        functionId,
        functionName: func.name,
        totalCost: func.totalCost.toFixed(4),
        invocations: func.invocationCount,
        breakdown: {
            shotCost: costBreakdown.shotCost.toFixed(4),
            timeCost: costBreakdown.timeCost.toFixed(4),
            coldStartCost: costBreakdown.coldCost.toFixed(4)
        },
        averages: {
            costPerInvocation: (func.totalCost / func.invocationCount || 0).toFixed(6),
            costPerShot: (func.totalCost / (func.invocationCount * func.shots) || 0).toFixed(8)
        }
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    // Constants
    TRIGGER_TYPES,
    FUNCTION_STATES,
    PRICING,

    // Functions
    createFunction,
    listFunctions,
    getFunction,
    updateFunction,
    deleteFunction,

    // Invocation
    invokeFunction,
    listInvocations,

    // Triggers
    createTrigger,
    fireTrigger,
    listTriggers,

    // Stats
    getLambdaStats,
    getFunctionBilling
};
