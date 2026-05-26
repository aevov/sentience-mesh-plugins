/**
 * ACLDQB Swarm - Cloudflare Trigger
 * 
 * Lightweight CF Worker that just STARTS the swarm.
 * Actual compute happens on:
 * - Q3 Carrier-stored worker variations (100 workers)
 * - VPS running acldqb-swarm.js via pm2
 * - Game theory coordination via Oriki Deep
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        if (url.pathname === '/swarm/start') {
            ctx.waitUntil(triggerSwarm(env));
            return Response.json({
                status: 'started',
                message: 'Swarm triggered - workers coordinating via Q3 Carrier'
            });
        }

        if (url.pathname === '/swarm/status') {
            const status = await getSwarmStatus(env);
            return Response.json(status);
        }

        return Response.json({
            service: 'ACLDQB Swarm Trigger',
            endpoints: ['/swarm/start', '/swarm/status']
        });
    },

    async scheduled(event, env, ctx) {
        // Cron trigger - just pokes the VPS to keep swarm running
        await triggerSwarm(env);
    }
};

async function triggerSwarm(env) {
    const vpsEndpoint = env.VPS_ENDPOINT || 'https://usaxdreryerjejfdc-rep.convobuilder.com';

    try {
        // Trigger VPS swarm endpoint
        await fetch(`${vpsEndpoint}/swarm/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trigger: 'cloudflare', timestamp: Date.now() })
        });
    } catch (e) {
        console.log('[Swarm Trigger] VPS ping failed, swarm running independently');
    }

    // Read latest state from Q3 Carrier (via cache)
    try {
        const stateResp = await fetch(
            `https://s3.Q3 Carrier.eu/cr8os1/mining/swarm-state/latest.json`,
            { cf: { cacheTtl: 30 } }
        );
        if (stateResp.ok) {
            const state = await stateResp.json();
            console.log(`[Swarm] Active: ${state.variations?.length || 0} workers, ${state.totalShares || 0} shares`);
        }
    } catch (e) { }
}

async function getSwarmStatus(env) {
    try {
        const resp = await fetch(
            `https://s3.Q3 Carrier.eu/cr8os1/mining/swarm-state/latest.json`
        );
        if (resp.ok) {
            return await resp.json();
        }
    } catch (e) { }

    return { status: 'unknown', message: 'Could not fetch state from Q3 Carrier' };
}
