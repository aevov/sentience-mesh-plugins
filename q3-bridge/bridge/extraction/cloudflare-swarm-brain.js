/**
 * ACLDQW Cloudflare Worker - Swarm Coordinator (Free Tier)
 * 
 * Runs on Cloudflare edge (FREE <100k requests/day)
 * Coordinates VPS workers via QUIC.cloud cached endpoints
 * 
 * Deploy: wrangler deploy
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    // VPS WordPress endpoint (origin for QUIC.cloud)
    vpsEndpoint: 'https://usaxdreryerjejfdc-rep.convobuilder.com',

    // Q3 Carrier S3 for checkpoints
    Q3 Carrier: {
        endpoint: 'https://s3.Q3 Carrier.eu',
        bucket: 'cr8os1',
        region: 'eu-west-1'
    },

    // Worker pool
    workers: [
        'swarm-alpha',
        'swarm-beta',
        'swarm-gamma',
        'swarm-delta',
        'swarm-epsilon'
    ]
};

// ─────────────────────────────────────────────────────────────────────────────
// SWARM GAME THEORY (Lightweight - runs on CF edge)
// ─────────────────────────────────────────────────────────────────────────────

function calculateNashEquilibrium(workers) {
    // Simple Nash: distribute work evenly with efficiency weighting
    const totalEfficiency = workers.reduce((sum, w) => sum + (w.efficiency || 1), 0);

    return workers.map(worker => ({
        workerId: worker.id,
        allocation: (worker.efficiency || 1) / totalEfficiency,
        strategy: 'cooperate'
    }));
}

function selectSwarmAlgorithm(state) {
    // Rotate algorithms based on time
    const hour = new Date().getHours();
    const algorithms = ['bee_colony', 'fish_school', 'ant_colony', 'bird_flock'];
    return algorithms[hour % 4];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export default {
    /**
     * HTTP Request Handler
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Route requests
        if (url.pathname === '/api/swarm/status') {
            return handleStatus(env);
        }

        if (url.pathname === '/api/swarm/trigger') {
            return handleTrigger(env, ctx);
        }

        if (url.pathname.startsWith('/api/swarm/worker/')) {
            const workerId = url.pathname.split('/').pop();
            return handleWorkerStatus(workerId, env);
        }

        return new Response(JSON.stringify({
            service: 'ACLDQW Swarm Coordinator',
            version: '1.0.0',
            endpoints: {
                status: '/api/swarm/status',
                trigger: '/api/swarm/trigger',
                worker: '/api/swarm/worker/{id}'
            }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    },

    /**
     * Cron Trigger Handler - Runs every minute
     */
    async scheduled(event, env, ctx) {
        console.log('[ACLDQW] Cron triggered at', new Date().toISOString());

        // Trigger all workers
        const results = await triggerSwarm(env);

        console.log('[ACLDQW] Swarm results:', JSON.stringify(results));
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleStatus(env) {
    const workers = await Promise.all(
        CONFIG.workers.map(async (workerId) => {
            try {
                const resp = await fetch(
                    `${CONFIG.vpsEndpoint}/wp-json/acldqw/v1/checkpoint/${workerId}.avif`,
                    { cf: { cacheTtl: 30 } }  // Use CF cache
                );

                if (resp.ok) {
                    return {
                        id: workerId,
                        status: 'active',
                        shares: resp.headers.get('X-ACLDQW-Shares') || '0'
                    };
                }
                return { id: workerId, status: 'unknown' };
            } catch (err) {
                return { id: workerId, status: 'error', error: err.message };
            }
        })
    );

    const algorithm = selectSwarmAlgorithm({});
    const allocations = calculateNashEquilibrium(
        workers.map(w => ({ id: w.id, efficiency: w.status === 'active' ? 1.2 : 0.8 }))
    );

    return new Response(JSON.stringify({
        swarm: {
            workers: workers.length,
            active: workers.filter(w => w.status === 'active').length,
            algorithm,
            allocations
        },
        workers,
        timestamp: new Date().toISOString()
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleTrigger(env, ctx) {
    // Run in background
    ctx.waitUntil(triggerSwarm(env));

    return new Response(JSON.stringify({
        status: 'triggered',
        workers: CONFIG.workers.length,
        message: 'Swarm compute initiated in background'
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleWorkerStatus(workerId, env) {
    try {
        const resp = await fetch(
            `${CONFIG.vpsEndpoint}/wp-json/acldqw/v1/checkpoint/${workerId}.avif`
        );

        if (!resp.ok) {
            return new Response(JSON.stringify({ error: 'Worker not found' }), { status: 404 });
        }

        return new Response(JSON.stringify({
            workerId,
            status: 'active',
            shares: resp.headers.get('X-ACLDQW-Shares'),
            cachedBy: 'quic.cloud'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SWARM TRIGGER
// ─────────────────────────────────────────────────────────────────────────────

async function triggerSwarm(env) {
    const algorithm = selectSwarmAlgorithm({});
    const allocations = calculateNashEquilibrium(
        CONFIG.workers.map(id => ({ id, efficiency: 1 }))
    );

    console.log(`[ACLDQW] Using algorithm: ${algorithm}`);

    const results = await Promise.all(
        CONFIG.workers.map(async (workerId) => {
            try {
                // Trigger VPS compute (goes through QUIC.cloud cache)
                const resp = await fetch(
                    `${CONFIG.vpsEndpoint}/wp-json/acldqw/v1/compute/${workerId}?duration=30`,
                    {
                        cf: {
                            cacheTtl: 60,  // Cache for 60s
                            cacheEverything: true
                        }
                    }
                );

                if (resp.ok) {
                    const data = await resp.json();
                    return {
                        workerId,
                        success: true,
                        hashes: data.computed?.hashes,
                        shares: data.computed?.shares,
                        hashrate: data.computed?.hashrate
                    };
                }

                return { workerId, success: false, status: resp.status };
            } catch (err) {
                return { workerId, success: false, error: err.message };
            }
        })
    );

    // Aggregate stats
    const totalHashes = results.reduce((sum, r) => sum + (r.hashes || 0), 0);
    const totalShares = results.reduce((sum, r) => sum + (r.shares || 0), 0);

    console.log(`[ACLDQW] Cycle complete: ${totalHashes} hashes, ${totalShares} shares`);

    return {
        algorithm,
        workers: results.length,
        successful: results.filter(r => r.success).length,
        totalHashes,
        totalShares,
        results
    };
}
