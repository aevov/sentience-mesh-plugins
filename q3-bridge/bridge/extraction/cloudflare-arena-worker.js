/**
 * ACLDQ Arena - Cloudflare Worker Edition
 * 
 * Runs perpetually on Cloudflare edge (FREE TIER)
 * Coordinates with VPS (QUIC.cloud origin) and Q3 Carrier (storage)
 * 
 * Deploy: wrangler deploy -c wrangler-arena.toml
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    vpsOrigin: 'https://usaxdreryerjejfdc-rep.convobuilder.com',
    Q3 CarrierEndpoint: 'https://s3.Q3 Carrier.eu',
    Q3 CarrierBucket: 'cr8os1',
    matchesPerTrigger: 500,
    maxCpuTime: 45000  // 45ms CPU budget (worker limit)
};

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTWEIGHT CIRCUIT CLASS (Edge-optimized)
// ─────────────────────────────────────────────────────────────────────────────

class EdgeCircuit {
    constructor(id, features, elo = 1500) {
        this.id = id;
        this.features = features;  // Pre-computed feature vector
        this.elo = elo;
        this.matches = 0;
        this.wins = 0;
    }

    static random(dim = 64) {
        const id = crypto.randomUUID().slice(0, 8);
        const features = new Float32Array(dim);
        for (let i = 0; i < dim; i++) {
            features[i] = Math.random() * 2 - 1;
        }
        // Normalize
        const norm = Math.sqrt(features.reduce((s, v) => s + v * v, 0));
        for (let i = 0; i < dim; i++) features[i] /= norm;
        return new EdgeCircuit(id, features);
    }

    mutate() {
        const newFeatures = new Float32Array(this.features.length);
        for (let i = 0; i < this.features.length; i++) {
            newFeatures[i] = this.features[i] + (Math.random() - 0.5) * 0.2;
        }
        // Normalize
        const norm = Math.sqrt(newFeatures.reduce((s, v) => s + v * v, 0));
        for (let i = 0; i < newFeatures.length; i++) newFeatures[i] /= norm;
        return new EdgeCircuit(crypto.randomUUID().slice(0, 8), newFeatures);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMILARITY ENGINE (Optimized for Edge)
// ─────────────────────────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;  // Already normalized, so dot = cosine
}

function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

// ─────────────────────────────────────────────────────────────────────────────
// ELO SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

function updateElo(a, b, scoreA, k = 32) {
    const expectedA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
    a.elo += k * (scoreA - expectedA);
    b.elo += k * ((1 - scoreA) - (1 - expectedA));
    a.matches++;
    b.matches++;
    if (scoreA > 0.5) a.wins++;
    else b.wins++;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARENA STATE (KV-backed)
// ─────────────────────────────────────────────────────────────────────────────

async function loadArenaState(env) {
    try {
        const state = await env.ARENA_KV.get('arena:state', 'json');
        if (state) {
            state.circuits = state.circuits.map(c =>
                new EdgeCircuit(c.id, Float32Array.from(c.features), c.elo)
            );
            return state;
        }
    } catch (e) { }

    // Initialize fresh
    const circuits = Array(100).fill(null).map(() => EdgeCircuit.random());
    return {
        circuits,
        totalMatches: 0,
        totalComputations: 0,
        cyclesCompleted: 0
    };
}

async function saveArenaState(env, state) {
    const serializable = {
        ...state,
        circuits: state.circuits.slice(0, 200).map(c => ({
            id: c.id,
            features: Array.from(c.features),
            elo: c.elo,
            matches: c.matches,
            wins: c.wins
        }))
    };
    await env.ARENA_KV.put('arena:state', JSON.stringify(serializable));
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN MATCHES
// ─────────────────────────────────────────────────────────────────────────────

function runMatches(circuits, count) {
    const results = [];
    let computations = 0;

    for (let i = 0; i < count; i++) {
        const idxA = Math.floor(Math.random() * circuits.length);
        let idxB = (idxA + 1 + Math.floor(Math.random() * (circuits.length - 1))) % circuits.length;

        const a = circuits[idxA];
        const b = circuits[idxB];

        // Compute similarity
        const sim = cosineSimilarity(a.features, b.features);
        const dist = euclideanDistance(a.features, b.features);
        computations += a.features.length * 2;

        // Score based on ELO-weighted performance
        const scoreA = a.elo >= b.elo ? 0.55 : 0.45;
        updateElo(a, b, scoreA);

        // Every 50 matches, evolve top performer
        if (i % 50 === 0 && i > 0) {
            const top = circuits.reduce((best, c) => c.elo > best.elo ? c : best);
            circuits.push(top.mutate());
        }

        results.push({ a: a.id, b: b.id, sim, dist });
    }

    return { results, computations };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/arena/status') {
            const state = await loadArenaState(env);
            const top10 = state.circuits
                .sort((a, b) => b.elo - a.elo)
                .slice(0, 10)
                .map(c => ({ id: c.id, elo: Math.round(c.elo), wins: c.wins, matches: c.matches }));

            return Response.json({
                status: 'running',
                totalMatches: state.totalMatches,
                totalComputations: state.totalComputations,
                cyclesCompleted: state.cyclesCompleted,
                circuitCount: state.circuits.length,
                topCircuits: top10
            });
        }

        if (url.pathname === '/arena/trigger') {
            ctx.waitUntil(runArenaCycle(env));
            return Response.json({ triggered: true });
        }

        if (url.pathname === '/arena/rankings.avif') {
            // Return rankings as AVIF for QUIC.cloud caching
            const state = await loadArenaState(env);
            const rankings = state.circuits
                .sort((a, b) => b.elo - a.elo)
                .slice(0, 50)
                .map(c => ({ id: c.id, elo: Math.round(c.elo) }));

            // Embed in minimal AVIF (XMP metadata)
            const json = JSON.stringify({ rankings, timestamp: Date.now() });
            const avif = createMinimalAVIF(json);

            return new Response(avif, {
                headers: {
                    'Content-Type': 'image/avif',
                    'Cache-Control': 'public, max-age=60',
                    'X-Arena-Circuits': state.circuits.length.toString(),
                    'X-Arena-Matches': state.totalMatches.toString()
                }
            });
        }

        return Response.json({
            service: 'ACLDQ Arena Edge',
            endpoints: ['/arena/status', '/arena/trigger', '/arena/rankings.avif']
        });
    },

    async scheduled(event, env, ctx) {
        console.log('[Arena] Cron triggered');
        await runArenaCycle(env);
    }
};

async function runArenaCycle(env) {
    const state = await loadArenaState(env);

    const { results, computations } = runMatches(state.circuits, CONFIG.matchesPerTrigger);

    state.totalMatches += results.length;
    state.totalComputations += computations;
    state.cyclesCompleted++;

    // Prune to top 200 circuits
    if (state.circuits.length > 200) {
        state.circuits.sort((a, b) => b.elo - a.elo);
        state.circuits = state.circuits.slice(0, 200);
    }

    await saveArenaState(env, state);

    // Trigger VPS to cache results via QUIC.cloud
    try {
        await fetch(`${CONFIG.vpsOrigin}/arena/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                matches: results.length,
                computations,
                topElo: Math.max(...state.circuits.map(c => c.elo))
            })
        });
    } catch (e) { }

    console.log(`[Arena] Cycle ${state.cyclesCompleted}: ${results.length} matches, ${computations} computations`);
}

function createMinimalAVIF(jsonData) {
    // Minimal 1x1 AVIF with XMP containing our data
    const base = new Uint8Array([
        0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70,
        0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
        0x61, 0x76, 0x69, 0x66, 0x6D, 0x69, 0x66, 0x31,
        0x00, 0x00, 0x00, 0x00
    ]);

    const xmp = new TextEncoder().encode(
        `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
        `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
        `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
        `<rdf:Description xmlns:arena="http://cr8os.io/arena/1.0/">` +
        `<arena:data>${jsonData}</arena:data>` +
        `</rdf:Description></rdf:RDF></x:xmpmeta>` +
        `<?xpacket end="w"?>`
    );

    const result = new Uint8Array(base.length + xmp.length + 8);
    result.set(base, 0);
    // XMP box header
    const xmpLen = xmp.length + 8;
    result[base.length] = (xmpLen >> 24) & 0xFF;
    result[base.length + 1] = (xmpLen >> 16) & 0xFF;
    result[base.length + 2] = (xmpLen >> 8) & 0xFF;
    result[base.length + 3] = xmpLen & 0xFF;
    result[base.length + 4] = 0x58; // X
    result[base.length + 5] = 0x4D; // M
    result[base.length + 6] = 0x50; // P
    result[base.length + 7] = 0x20; // space
    result.set(xmp, base.length + 8);

    return result;
}
