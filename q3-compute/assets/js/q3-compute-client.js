/**
 * Q3 Compute Client SDK
 * For app.quantumcloud.one integration
 * 
 * @version 1.0.0
 * @author Cr8OS Research
 */

class Q3ComputeClient {
    constructor(config = {}) {
        this.endpoint = config.endpoint || '';
        this.username = config.username || '';
        this.password = config.password || '';
        this.pollInterval = config.pollInterval || 500;
        this.maxPollAttempts = config.maxPollAttempts || 60;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════════════════════════════════════

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.username && this.password) {
            headers['Authorization'] = 'Basic ' + btoa(`${this.username}:${this.password}`);
        }

        return headers;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Get compute capacity
     */
    async getCapacity() {
        const response = await fetch(`${this.endpoint}/capacity`);
        return response.json();
    }

    /**
     * List available operations
     */
    async getOperations() {
        const response = await fetch(`${this.endpoint}/operations`);
        return response.json();
    }

    /**
     * Submit async compute job
     */
    async submit(type, params = {}, options = {}) {
        const response = await fetch(`${this.endpoint}/submit`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                type,
                params,
                priority: options.priority || 'normal',
                callback_url: options.callbackUrl
            })
        });
        return response.json();
    }

    /**
     * Sync compute (immediate result for small jobs)
     */
    async compute(type, params = {}) {
        const response = await fetch(`${this.endpoint}/compute`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ type, params })
        });
        return response.json();
    }

    /**
     * Get job status
     */
    async getStatus(jobId) {
        const response = await fetch(`${this.endpoint}/status/${jobId}`, {
            headers: this.getHeaders()
        });
        return response.json();
    }

    /**
     * Get job result
     */
    async getResult(jobId) {
        const response = await fetch(`${this.endpoint}/result/${jobId}`, {
            headers: this.getHeaders()
        });
        return response.json();
    }

    /**
     * Cancel job
     */
    async cancel(jobId) {
        const response = await fetch(`${this.endpoint}/cancel/${jobId}`, {
            method: 'POST',
            headers: this.getHeaders()
        });
        return response.json();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONVENIENCE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Submit and wait for result
     */
    async submitAndWait(type, params = {}, options = {}) {
        const job = await this.submit(type, params, options);

        if (!job.success) {
            throw new Error(job.error || 'Failed to submit job');
        }

        return this.waitForResult(job.job_id);
    }

    /**
     * Poll for job completion
     */
    async waitForResult(jobId) {
        let attempts = 0;

        while (attempts < this.maxPollAttempts) {
            const result = await this.getResult(jobId);

            if (result.success) {
                return result;
            }

            if (result.status === 'failed') {
                throw new Error(result.error || 'Job failed');
            }

            // Still processing
            await this.sleep(this.pollInterval);
            attempts++;
        }

        throw new Error('Job timed out');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OPERATION SHORTCUTS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * SHA256d hash batch
     */
    async sha256d(header, nonceStart, nonceEnd) {
        return this.compute('sha256d', {
            header,
            nonce_start: nonceStart,
            nonce_end: nonceEnd
        });
    }

    /**
     * Grover search
     */
    async groverSearch(databaseSize, targetPattern) {
        return this.compute('grover_search', {
            database_size: databaseSize,
            target_pattern: targetPattern
        });
    }

    /**
     * QAOA optimization
     */
    async optimize(problem, layers = 3) {
        return this.submitAndWait('qaoa_optimize', {
            problem,
            layers
        });
    }

    /**
     * Generate quantum random numbers
     */
    async randomCircuit(numQubits = 10, depth = 20, shots = 1000) {
        return this.compute('random_circuit', {
            num_qubits: numQubits,
            depth,
            shots
        });
    }

    /**
     * VQE chemistry calculation
     */
    async vqeChemistry(molecule = 'H2', basis = 'sto-3g') {
        return this.submitAndWait('vqe_chemistry', {
            molecule,
            basis
        });
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Q3ComputeClient;
}

if (typeof window !== 'undefined') {
    window.Q3ComputeClient = Q3ComputeClient;
}
