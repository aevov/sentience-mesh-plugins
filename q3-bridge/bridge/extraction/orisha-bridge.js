// Orisha Bridge - JavaScript Quantum Simulator
// Provides real quantum execution for ACLDQ circuits
// Compatible with Orisha Rust modules via shared ACLDQ format

const crypto = require('crypto');

/**
 * Quantum State Vector (pure JavaScript implementation)
 * Matches Obatala StateVector interface
 */
class QuantumState {
    constructor(numQubits) {
        this.numQubits = numQubits;
        this.dim = 1 << numQubits; // 2^numQubits

        // State vector: complex amplitudes [re0, im0, re1, im1, ...]
        this.amplitudes = new Float64Array(this.dim * 2);
        this.amplitudes[0] = 1.0; // |0...0⟩ state
    }

    /**
     * Get amplitude at index
     */
    amplitude(index) {
        return {
            re: this.amplitudes[index * 2],
            im: this.amplitudes[index * 2 + 1],
        };
    }

    /**
     * Set amplitude at index
     */
    setAmplitude(index, re, im) {
        this.amplitudes[index * 2] = re;
        this.amplitudes[index * 2 + 1] = im;
    }

    /**
     * 1/sqrt(2) constant
     */
    static SQRT2_INV = 1 / Math.sqrt(2);
}

/**
 * Quantum Gate Operations
 */
class QuantumGates {
    /**
     * Hadamard gate on qubit
     */
    static hadamard(state, qubit) {
        const step = 1 << qubit;
        const inv = QuantumState.SQRT2_INV;

        for (let i = 0; i < state.dim; i++) {
            if ((i & step) === 0) {
                const j = i | step;
                const a = state.amplitude(i);
                const b = state.amplitude(j);

                // H|0⟩ = (|0⟩ + |1⟩)/√2
                // H|1⟩ = (|0⟩ - |1⟩)/√2
                state.setAmplitude(i, inv * (a.re + b.re), inv * (a.im + b.im));
                state.setAmplitude(j, inv * (a.re - b.re), inv * (a.im - b.im));
            }
        }
        return state;
    }

    /**
     * Pauli-X gate (NOT)
     */
    static pauliX(state, qubit) {
        const step = 1 << qubit;

        for (let i = 0; i < state.dim; i++) {
            if ((i & step) === 0) {
                const j = i | step;
                const a = state.amplitude(i);
                const b = state.amplitude(j);

                state.setAmplitude(i, b.re, b.im);
                state.setAmplitude(j, a.re, a.im);
            }
        }
        return state;
    }

    /**
     * Pauli-Y gate
     */
    static pauliY(state, qubit) {
        const step = 1 << qubit;

        for (let i = 0; i < state.dim; i++) {
            if ((i & step) === 0) {
                const j = i | step;
                const a = state.amplitude(i);
                const b = state.amplitude(j);

                // Y = [[0, -i], [i, 0]]
                state.setAmplitude(i, b.im, -b.re);
                state.setAmplitude(j, -a.im, a.re);
            }
        }
        return state;
    }

    /**
     * Pauli-Z gate
     */
    static pauliZ(state, qubit) {
        const step = 1 << qubit;

        for (let i = 0; i < state.dim; i++) {
            if ((i & step) !== 0) {
                const a = state.amplitude(i);
                state.setAmplitude(i, -a.re, -a.im);
            }
        }
        return state;
    }

    /**
     * CNOT gate (controlled-X)
     */
    static cnot(state, control, target) {
        const controlStep = 1 << control;
        const targetStep = 1 << target;

        for (let i = 0; i < state.dim; i++) {
            // Only flip target when control is 1
            if ((i & controlStep) !== 0 && (i & targetStep) === 0) {
                const j = i | targetStep;
                const a = state.amplitude(i);
                const b = state.amplitude(j);

                state.setAmplitude(i, b.re, b.im);
                state.setAmplitude(j, a.re, a.im);
            }
        }
        return state;
    }

    /**
     * Rotation around Z axis
     */
    static rz(state, qubit, theta) {
        const step = 1 << qubit;
        const cos = Math.cos(theta / 2);
        const sin = Math.sin(theta / 2);

        for (let i = 0; i < state.dim; i++) {
            const a = state.amplitude(i);
            if ((i & step) === 0) {
                // e^(-iθ/2)
                state.setAmplitude(i, a.re * cos + a.im * sin, a.im * cos - a.re * sin);
            } else {
                // e^(iθ/2)
                state.setAmplitude(i, a.re * cos - a.im * sin, a.im * cos + a.re * sin);
            }
        }
        return state;
    }
}

/**
 * ACLDQ Circuit Parser
 * Parses ACLDQ binary/JSON format into executable gates
 */
class AcldqParser {
    static parse(buffer) {
        // Try JSON format first
        try {
            const str = buffer.toString('utf-8');
            const json = JSON.parse(str);
            return this.parseJson(json);
        } catch (e) {
            // Binary format
            return this.parseBinary(buffer);
        }
    }

    static parseJson(json) {
        return {
            id: json.id || crypto.randomUUID(),
            numQubits: json.qubits || json.num_qubits || 2,
            gates: (json.gates || json.operations || []).map(g => ({
                type: g.gate || g.type || 'H',
                qubits: g.qubits || [g.qubit || 0],
                params: g.params || g.parameters || [],
            })),
            metadata: json.metadata || {},
        };
    }

    static parseBinary(buffer) {
        // Simple binary format:
        // [4 bytes: num_qubits] [4 bytes: num_gates] [gates...]
        // Each gate: [1 byte: type] [1 byte: qubit1] [1 byte: qubit2] [8 bytes: param]

        const numQubits = buffer.readUInt32LE(0);
        const numGates = buffer.readUInt32LE(4);
        const gates = [];

        const gateTypes = ['H', 'X', 'Y', 'Z', 'CNOT', 'RZ', 'RY', 'RX'];

        let offset = 8;
        for (let i = 0; i < numGates && offset < buffer.length; i++) {
            const typeIdx = buffer.readUInt8(offset);
            const qubit1 = buffer.readUInt8(offset + 1);
            const qubit2 = buffer.readUInt8(offset + 2);
            const param = buffer.readDoubleLE(offset + 3);

            gates.push({
                type: gateTypes[typeIdx] || 'H',
                qubits: typeIdx === 4 ? [qubit1, qubit2] : [qubit1],
                params: [param],
            });

            offset += 11;
        }

        return {
            id: crypto.randomUUID(),
            numQubits: Math.max(numQubits, 2),
            gates,
            metadata: { format: 'binary' },
        };
    }
}

/**
 * Orisha Quantum Executor
 * Executes ACLDQ circuits and performs measurements
 */
class OrishaExecutor {
    constructor() {
        this.stats = {
            circuitsExecuted: 0,
            gatesApplied: 0,
            totalShots: 0,
        };
    }

    /**
     * Execute ACLDQ circuit buffer
     */
    async execute(buffer, shots = 1000) {
        const startTime = Date.now();

        // Parse ACLDQ
        const circuit = AcldqParser.parse(buffer);
        console.log(`🔬 Orisha: Executing ${circuit.gates.length} gates on ${circuit.numQubits} qubits`);

        // Create quantum state
        let state = new QuantumState(circuit.numQubits);

        // Apply gates
        for (const gate of circuit.gates) {
            state = this.applyGate(state, gate);
            this.stats.gatesApplied++;
        }

        // Measure
        const measurements = this.measure(state, shots);
        this.stats.circuitsExecuted++;
        this.stats.totalShots += shots;

        const executionTime = Date.now() - startTime;
        console.log(`🔬 Orisha: Completed in ${executionTime}ms`);

        return {
            circuit_id: circuit.id,
            num_qubits: circuit.numQubits,
            gates_applied: circuit.gates.length,
            shots,
            measurements,
            statevector: this.getStatevector(state),
            execution_time_ms: executionTime,
            metadata: {
                executor: 'orisha-js',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Apply a gate to the state
     */
    applyGate(state, gate) {
        const qubit = gate.qubits[0];
        const qubit2 = gate.qubits[1];
        const param = gate.params?.[0] || 0;

        switch (gate.type.toUpperCase()) {
            case 'H':
                return QuantumGates.hadamard(state, qubit);
            case 'X':
                return QuantumGates.pauliX(state, qubit);
            case 'Y':
                return QuantumGates.pauliY(state, qubit);
            case 'Z':
                return QuantumGates.pauliZ(state, qubit);
            case 'CNOT':
            case 'CX':
                return QuantumGates.cnot(state, qubit, qubit2);
            case 'RZ':
                return QuantumGates.rz(state, qubit, param);
            default:
                console.warn(`Unknown gate: ${gate.type}`);
                return state;
        }
    }

    /**
     * Measure the quantum state
     */
    measure(state, shots) {
        const outcomes = {};
        const probabilities = [];

        // Calculate probabilities
        for (let i = 0; i < state.dim; i++) {
            const amp = state.amplitude(i);
            probabilities[i] = amp.re * amp.re + amp.im * amp.im;
        }

        // Sample measurements
        for (let s = 0; s < shots; s++) {
            const r = Math.random();
            let cumulative = 0;

            for (let i = 0; i < state.dim; i++) {
                cumulative += probabilities[i];
                if (r < cumulative) {
                    const bitstring = i.toString(2).padStart(state.numQubits, '0');
                    outcomes[bitstring] = (outcomes[bitstring] || 0) + 1;
                    break;
                }
            }
        }

        return outcomes;
    }

    /**
     * Get statevector as flat array
     */
    getStatevector(state) {
        const result = [];
        for (let i = 0; i < state.dim; i++) {
            const amp = state.amplitude(i);
            result.push({ re: amp.re, im: amp.im });
        }
        return result;
    }
}

// Singleton instance
const executor = new OrishaExecutor();

module.exports = {
    QuantumState,
    QuantumGates,
    AcldqParser,
    OrishaExecutor,
    executor,

    // Convenience function
    async executeAcldq(buffer, shots = 1000) {
        return executor.execute(buffer, shots);
    },
};
