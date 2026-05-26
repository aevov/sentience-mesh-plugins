/**
 * ACLDQW - ACLDQ Worker Swarm Coordination
 * 
 * ⚠️  THIS RUNS ON QUIC.CLOUD / Q3_CARRIER EDGE - NOT LOCALLY ⚠️
 * 
 * Deploy to:
 *   1. Upload to Q3 Carrier: s3://cr8os1/workers/acldqw-swarm-coordinator.js
 *   2. QUIC.cloud edge invokes this worker perpetually
 *   3. Checkpoints persist to Q3 Carrier S3
 *   4. Mining continues even when your laptop is OFF
 * 
 * Biomimetic swarm algorithms with game theory for perpetual worker coordination:
 * - 🐝 Bee Colony: Waggle dance communication, scout/forager roles
 * - 🐟 Fish School: Alignment, cohesion, separation flocking
 * - 🐜 Ant Colony: Pheromone trails, stigmergic coordination
 * - 🐦 Bird Flock: Murmuration dynamics, V-formation efficiency
 * 
 * Game Theory Integration:
 * - Nash equilibrium for resource allocation
 * - Payoff matrices for task selection
 * - Cooperative/competitive strategy switching
 * 
 * Managed by Oriki for automatic handler triggering on QUIC.cloud edge
 */

const crypto = require('crypto');
const https = require('https');
const EventEmitter = require('events');

// ─────────────────────────────────────────────────────────────────────────────
// CLOUD DEPLOYMENT CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CLOUD_CONFIG = {
    // Where this worker runs
    runtime: 'quic-cloud-edge',  // NOT LOCAL

    // QUIC.cloud domains that host this worker
    quicDomains: [
        'usaxdreryerjejfdc-rep.convobuilder.com',
        'rate.convobuilder.com',
        'app.convobuilder.com'
    ],

    // Q3 Carrier S3 for checkpoint persistence
    Q3 Carrier: {
        endpoint: 'https://s3.Q3 Carrier.eu',
        region: 'eu-west-1',
        bucket: 'cr8os1',
        workerPath: 'workers/acldqw-swarm-coordinator.js',
        checkpointPath: 'mining/swarm-checkpoints'
    },

    // Perpetual execution
    perpetual: true,
    restartOnCrash: true
};

// ─────────────────────────────────────────────────────────────────────────────
// ACLDQW FORMAT
// ─────────────────────────────────────────────────────────────────────────────

const ACLDQW_MAGIC = Buffer.from([0xAC, 0x1D, 0xDC, 0x57]);  // ACLDQW
const ACLDQW_VERSION = 1;

// Swarm algorithm types
const SWARM_ALGORITHMS = {
    BEE_COLONY: 0x01,
    FISH_SCHOOL: 0x02,
    ANT_COLONY: 0x03,
    BIRD_FLOCK: 0x04,
    HYBRID: 0xFF
};

// Worker roles
const WORKER_ROLES = {
    SCOUT: 'scout',       // Explores new work
    FORAGER: 'forager',   // Processes work
    NURSE: 'nurse',       // Maintains checkpoints
    QUEEN: 'queen',       // Coordinates swarm
    DRONE: 'drone'        // Backup/redundancy
};

// ─────────────────────────────────────────────────────────────────────────────
// GAME THEORY ENGINE
// ─────────────────────────────────────────────────────────────────────────────

class GameTheoryEngine {
    constructor() {
        // Payoff matrix for task selection (rows=self, cols=others)
        // Values: [self_payoff, collective_payoff]
        this.payoffMatrix = {
            cooperate_cooperate: [3, 3],
            cooperate_defect: [0, 5],
            defect_cooperate: [5, 0],
            defect_defect: [1, 1]
        };

        // Strategy memory for iterated games
        this.strategyHistory = [];
        this.cooperationRate = 0.7;  // Start cooperative
    }

    /**
     * Calculate Nash equilibrium for resource allocation
     */
    nashEquilibrium(workers, resources) {
        const n = workers.length;
        const allocations = [];

        // Each worker bids based on their utility function
        for (const worker of workers) {
            const utility = this.calculateUtility(worker, resources);
            const bid = utility / workers.reduce((sum, w) =>
                sum + this.calculateUtility(w, resources), 0);
            allocations.push({
                workerId: worker.id,
                allocation: bid * resources.total,
                utility
            });
        }

        // Iterate to equilibrium
        let stable = false;
        let iterations = 0;
        while (!stable && iterations < 100) {
            stable = true;
            for (let i = 0; i < allocations.length; i++) {
                const bestResponse = this.bestResponse(allocations, i, resources);
                if (Math.abs(bestResponse - allocations[i].allocation) > 0.01) {
                    allocations[i].allocation = bestResponse;
                    stable = false;
                }
            }
            iterations++;
        }

        return allocations;
    }

    calculateUtility(worker, resources) {
        // Utility based on worker capabilities and resource needs
        const hashPower = worker.hashrate || 1000;
        const efficiency = worker.efficiency || 0.8;
        const uptime = worker.uptime || 0.9;

        return hashPower * efficiency * uptime;
    }

    bestResponse(allocations, playerIndex, resources) {
        const others = allocations.filter((_, i) => i !== playerIndex);
        const othersTotal = others.reduce((sum, a) => sum + a.allocation, 0);
        const remaining = resources.total - othersTotal;

        // Best response: take fair share while maximizing utility
        return Math.max(0, Math.min(remaining, resources.total / allocations.length * 1.2));
    }

    /**
     * Tit-for-tat strategy for repeated interactions
     */
    titForTat(lastOpponentMove) {
        if (this.strategyHistory.length === 0) {
            return 'cooperate';  // Start cooperative
        }
        return lastOpponentMove;  // Mirror opponent
    }

    /**
     * Generous tit-for-tat (forgives occasionally)
     */
    generousTitForTat(lastOpponentMove) {
        if (lastOpponentMove === 'defect' && Math.random() < 0.1) {
            return 'cooperate';  // 10% forgiveness
        }
        return this.titForTat(lastOpponentMove);
    }

    /**
     * Select strategy based on swarm state
     */
    selectStrategy(swarmState) {
        const { resourceScarcity, competitionLevel, trustScore } = swarmState;

        if (trustScore > 0.8 && resourceScarcity < 0.3) {
            return 'cooperate';  // High trust, abundant resources
        } else if (competitionLevel > 0.7) {
            return this.generousTitForTat(swarmState.lastOpponentMove);
        } else {
            return Math.random() < this.cooperationRate ? 'cooperate' : 'defect';
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BIOMIMETIC SWARM ALGORITHMS
// ─────────────────────────────────────────────────────────────────────────────

class BeeColonyAlgorithm {
    constructor() {
        this.name = 'bee_colony';
        this.scouts = [];
        this.foragers = [];
        this.waggleDances = new Map();  // Work location broadcasts
    }

    /**
     * Scout bees explore for new work
     */
    scoutPhase(workers, workSources) {
        const scouts = workers.filter(w => w.role === WORKER_ROLES.SCOUT);
        const discoveries = [];

        for (const scout of scouts) {
            // Explore random work sources
            const source = workSources[Math.floor(Math.random() * workSources.length)];
            const quality = this.evaluateSource(source);

            if (quality > 0.5) {
                discoveries.push({
                    workerId: scout.id,
                    source,
                    quality,
                    timestamp: Date.now()
                });

                // Waggle dance: broadcast to other bees
                this.waggleDance(scout, source, quality);
            }
        }

        return discoveries;
    }

    /**
     * Waggle dance: communicate work location quality
     */
    waggleDance(scout, source, quality) {
        // Dance duration proportional to quality
        const danceIntensity = Math.floor(quality * 10);

        this.waggleDances.set(source.id, {
            scout: scout.id,
            source,
            quality,
            intensity: danceIntensity,
            expiry: Date.now() + (danceIntensity * 10000)
        });

        return danceIntensity;
    }

    /**
     * Forager bees follow waggle dances to work
     */
    foragerPhase(workers) {
        const foragers = workers.filter(w => w.role === WORKER_ROLES.FORAGER);
        const assignments = [];

        // Sort dances by quality
        const activeDances = Array.from(this.waggleDances.values())
            .filter(d => d.expiry > Date.now())
            .sort((a, b) => b.quality - a.quality);

        for (const forager of foragers) {
            // Probability of following dance proportional to intensity
            const totalIntensity = activeDances.reduce((sum, d) => sum + d.intensity, 0);
            let random = Math.random() * totalIntensity;

            for (const dance of activeDances) {
                random -= dance.intensity;
                if (random <= 0) {
                    assignments.push({
                        workerId: forager.id,
                        source: dance.source,
                        assignedBy: dance.scout
                    });
                    break;
                }
            }
        }

        return assignments;
    }

    evaluateSource(source) {
        // Quality based on: difficulty, reward, distance
        const reward = source.reward || 1;
        const difficulty = source.difficulty || 1;
        const latency = source.latency || 100;

        return (reward / difficulty) / (1 + latency / 1000);
    }
}

class FishSchoolAlgorithm {
    constructor() {
        this.name = 'fish_school';
        this.alignmentWeight = 1.0;
        this.cohesionWeight = 1.0;
        this.separationWeight = 1.5;
        this.predatorAvoidance = 2.0;
    }

    /**
     * Fish schooling behavior for coordinated mining
     */
    calculateMovement(fish, school, predators = []) {
        const alignment = this.alignmentVector(fish, school);
        const cohesion = this.cohesionVector(fish, school);
        const separation = this.separationVector(fish, school);
        const avoidance = this.avoidanceVector(fish, predators);

        return {
            workerId: fish.id,
            direction: {
                x: alignment.x * this.alignmentWeight +
                    cohesion.x * this.cohesionWeight +
                    separation.x * this.separationWeight +
                    avoidance.x * this.predatorAvoidance,
                y: alignment.y * this.alignmentWeight +
                    cohesion.y * this.cohesionWeight +
                    separation.y * this.separationWeight +
                    avoidance.y * this.predatorAvoidance
            },
            targetHashrate: this.calculateTargetHashrate(fish, school)
        };
    }

    /**
     * Align with neighbors (match hashrate)
     */
    alignmentVector(fish, school) {
        const neighbors = this.getNeighbors(fish, school, 0.3);
        if (neighbors.length === 0) return { x: 0, y: 0 };

        const avgHashrate = neighbors.reduce((sum, n) => sum + n.hashrate, 0) / neighbors.length;
        return {
            x: (avgHashrate - fish.hashrate) / avgHashrate,
            y: 0
        };
    }

    /**
     * Cohesion: move toward center of school
     */
    cohesionVector(fish, school) {
        const center = this.schoolCenter(school);
        return {
            x: (center.avgHashrate - fish.hashrate) / (center.avgHashrate || 1),
            y: (center.avgShares - fish.shares) / (center.avgShares || 1)
        };
    }

    /**
     * Separation: avoid crowding same work
     */
    separationVector(fish, school) {
        const neighbors = this.getNeighbors(fish, school, 0.1);
        if (neighbors.length === 0) return { x: 0, y: 0 };

        const sameWork = neighbors.filter(n => n.currentWork === fish.currentWork);
        return {
            x: sameWork.length > 3 ? -1 : 0,  // Too crowded, move away
            y: 0
        };
    }

    /**
     * Avoid predators (failed pools, high-reject sources)
     */
    avoidanceVector(fish, predators) {
        if (predators.length === 0) return { x: 0, y: 0 };

        const nearestPredator = predators.find(p => p.affectedWorkers?.includes(fish.id));
        if (nearestPredator) {
            return { x: -1, y: -1 };  // Flee!
        }
        return { x: 0, y: 0 };
    }

    getNeighbors(fish, school, radius) {
        return school.filter(f =>
            f.id !== fish.id &&
            Math.abs(f.hashrate - fish.hashrate) / fish.hashrate < radius
        );
    }

    schoolCenter(school) {
        return {
            avgHashrate: school.reduce((sum, f) => sum + f.hashrate, 0) / school.length,
            avgShares: school.reduce((sum, f) => sum + f.shares, 0) / school.length
        };
    }

    calculateTargetHashrate(fish, school) {
        const center = this.schoolCenter(school);
        return center.avgHashrate * (0.9 + Math.random() * 0.2);
    }
}

class AntColonyAlgorithm {
    constructor() {
        this.name = 'ant_colony';
        this.pheromones = new Map();  // Work path → strength
        this.evaporationRate = 0.1;
        this.depositRate = 1.0;
    }

    /**
     * Pheromone-based path selection
     */
    selectPath(ant, availablePaths) {
        // Calculate probabilities based on pheromone levels
        const probabilities = availablePaths.map(path => {
            const pheromone = this.pheromones.get(path.id) || 0.1;
            const heuristic = 1 / (path.difficulty || 1);  // Inverse difficulty
            return {
                path,
                probability: Math.pow(pheromone, 2) * Math.pow(heuristic, 3)
            };
        });

        const total = probabilities.reduce((sum, p) => sum + p.probability, 0);
        let random = Math.random() * total;

        for (const p of probabilities) {
            random -= p.probability;
            if (random <= 0) {
                return p.path;
            }
        }

        return probabilities[0]?.path;
    }

    /**
     * Deposit pheromone on successful path
     */
    depositPheromone(path, quality) {
        const current = this.pheromones.get(path.id) || 0;
        this.pheromones.set(path.id, current + this.depositRate * quality);
    }

    /**
     * Evaporate pheromones over time
     */
    evaporate() {
        for (const [pathId, strength] of this.pheromones) {
            const newStrength = strength * (1 - this.evaporationRate);
            if (newStrength < 0.01) {
                this.pheromones.delete(pathId);
            } else {
                this.pheromones.set(pathId, newStrength);
            }
        }
    }

    /**
     * Stigmergic coordination: leave marks for others
     */
    leaveMarker(ant, position, type) {
        const marker = {
            antId: ant.id,
            position,
            type,  // 'success', 'danger', 'exploring'
            timestamp: Date.now(),
            expiry: Date.now() + 60000
        };

        // Store in path
        const key = `${position.pool}:${position.difficulty}`;
        const existing = this.pheromones.get(key) || 0;

        if (type === 'success') {
            this.pheromones.set(key, existing + 1);
        } else if (type === 'danger') {
            this.pheromones.set(key, Math.max(0, existing - 2));
        }

        return marker;
    }
}

class BirdFlockAlgorithm {
    constructor() {
        this.name = 'bird_flock';
        this.vFormationAngle = 65;  // Degrees
        this.leaderRotationInterval = 300000;  // 5 min
        this.currentLeader = null;
        this.lastRotation = Date.now();
    }

    /**
     * V-formation for efficient work distribution
     */
    calculateFormation(birds) {
        this.rotateLeaderIfNeeded(birds);

        const formation = [];
        const leaderIndex = birds.findIndex(b => b.id === this.currentLeader);
        const leader = birds[leaderIndex] || birds[0];

        // Leader position
        formation.push({
            workerId: leader.id,
            role: 'leader',
            position: 0,
            workAllocation: 1.2,  // Leader gets 20% more work
            efficiency: 1.0
        });

        // Wings: alternate left and right
        let leftPos = 1, rightPos = 1;
        for (let i = 0; i < birds.length; i++) {
            if (birds[i].id === leader.id) continue;

            const side = i % 2 === 0 ? 'left' : 'right';
            const pos = side === 'left' ? leftPos++ : rightPos++;

            // Birds in slipstream get efficiency bonus
            const slipstreamBonus = 1 + (0.1 / pos);  // Decreasing with distance

            formation.push({
                workerId: birds[i].id,
                role: 'follower',
                position: pos,
                side,
                workAllocation: 1.0 / pos,  // Less work further back
                efficiency: slipstreamBonus
            });
        }

        return formation;
    }

    /**
     * Rotate leader to prevent fatigue
     */
    rotateLeaderIfNeeded(birds) {
        if (Date.now() - this.lastRotation > this.leaderRotationInterval) {
            const eligibleLeaders = birds.filter(b =>
                b.uptime > 0.9 && b.hashrate > this.averageHashrate(birds) * 0.8
            );

            if (eligibleLeaders.length > 0) {
                const newLeader = eligibleLeaders[
                    Math.floor(Math.random() * eligibleLeaders.length)
                ];
                this.currentLeader = newLeader.id;
                this.lastRotation = Date.now();
            }
        }
    }

    averageHashrate(birds) {
        return birds.reduce((sum, b) => sum + b.hashrate, 0) / birds.length;
    }

    /**
     * Murmuration: rapid coordinated response to threats
     */
    murmuration(birds, threat) {
        // All birds instantly respond to threat
        const responses = birds.map(bird => {
            const distance = this.distanceFromThreat(bird, threat);
            const urgency = Math.max(0, 1 - distance / 100);

            return {
                workerId: bird.id,
                action: urgency > 0.5 ? 'evade' : 'monitor',
                urgency,
                newTarget: urgency > 0.5 ? this.findSafeZone(bird, threat) : null
            };
        });

        return responses;
    }

    distanceFromThreat(bird, threat) {
        // Abstract distance based on work similarity
        if (bird.currentPool === threat.pool) return 0;
        return 100;
    }

    findSafeZone(bird, threat) {
        // Find alternative pool/work
        return { pool: 'backup', reason: 'murmuration_evade' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ORIKI HANDLER MANAGER
// ─────────────────────────────────────────────────────────────────────────────

class OrikiHandlerManager extends EventEmitter {
    constructor() {
        super();
        this.handlers = new Map();
        this.triggerQueue = [];
        this.processing = false;
    }

    /**
     * Register automatic handler
     */
    registerHandler(event, handler, priority = 5) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push({ handler, priority });
        this.handlers.get(event).sort((a, b) => b.priority - a.priority);
    }

    /**
     * Trigger handlers for event
     */
    async trigger(event, data) {
        const handlers = this.handlers.get(event) || [];

        for (const { handler } of handlers) {
            try {
                await handler(data);
            } catch (err) {
                console.error(`[Oriki] Handler error for ${event}:`, err);
            }
        }

        this.emit(event, data);
    }

    /**
     * Built-in Oriki handlers
     */
    initializeDefaultHandlers() {
        // Swarm coordination handler
        this.registerHandler('swarm:rebalance', async (data) => {
            console.log('[Oriki] Rebalancing swarm...', data.reason);
        }, 10);

        // Threat response handler
        this.registerHandler('swarm:threat', async (data) => {
            console.log('[Oriki] Threat detected, initiating murmuration...', data.threat);
        }, 10);

        // Checkpoint handler
        this.registerHandler('checkpoint:save', async (data) => {
            console.log('[Oriki] Saving checkpoint...', data.workerId);
        }, 5);

        // Worker spawn handler
        this.registerHandler('worker:spawn', async (data) => {
            console.log('[Oriki] Spawning new worker...', data.role);
        }, 8);

        // Nash equilibrium handler
        this.registerHandler('game:equilibrium', async (data) => {
            console.log('[Oriki] Applying Nash equilibrium allocation...');
        }, 7);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACLDQW SWARM COORDINATOR
// ─────────────────────────────────────────────────────────────────────────────

class ACLDQWSwarmCoordinator {
    constructor(config = {}) {
        this.config = {
            algorithm: config.algorithm || SWARM_ALGORITHMS.HYBRID,
            workerCount: config.workerCount || 10,
            checkpointInterval: config.checkpointInterval || 60000,
            ...config
        };

        // Initialize algorithms
        this.beeColony = new BeeColonyAlgorithm();
        this.fishSchool = new FishSchoolAlgorithm();
        this.antColony = new AntColonyAlgorithm();
        this.birdFlock = new BirdFlockAlgorithm();

        // Game theory engine
        this.gameTheory = new GameTheoryEngine();

        // Oriki handler manager
        this.oriki = new OrikiHandlerManager();
        this.oriki.initializeDefaultHandlers();

        // Swarm state
        this.workers = [];
        this.state = {
            algorithm: this.config.algorithm,
            totalHashes: 0n,
            totalShares: 0,
            startTime: Date.now(),
            lastCheckpoint: null
        };
    }

    /**
     * Initialize swarm with workers
     */
    async initialize(workerConfigs) {
        console.log('[ACLDQW] Initializing swarm with biomimetic coordination...');

        this.workers = workerConfigs.map((config, i) => ({
            id: config.id || `worker-${i}`,
            role: this.assignRole(i, workerConfigs.length),
            hashrate: config.hashrate || 50000,
            shares: 0,
            efficiency: 0.9 + Math.random() * 0.1,
            uptime: 1.0,
            currentWork: null,
            currentPool: config.pool || 'solo.ckpool.org'
        }));

        // Trigger worker spawn handlers
        for (const worker of this.workers) {
            await this.oriki.trigger('worker:spawn', worker);
        }

        console.log(`[ACLDQW] Swarm initialized with ${this.workers.length} workers`);
    }

    /**
     * Assign roles based on position (bee-inspired)
     */
    assignRole(index, total) {
        const ratio = index / total;
        if (ratio < 0.05) return WORKER_ROLES.QUEEN;
        if (ratio < 0.15) return WORKER_ROLES.SCOUT;
        if (ratio < 0.85) return WORKER_ROLES.FORAGER;
        if (ratio < 0.95) return WORKER_ROLES.NURSE;
        return WORKER_ROLES.DRONE;
    }

    /**
     * Run perpetual coordination loop
     */
    async runPerpetual() {
        console.log('[ACLDQW] Starting perpetual swarm coordination...');

        const loop = async () => {
            try {
                // 1. Game theory: calculate Nash equilibrium
                const allocations = this.gameTheory.nashEquilibrium(
                    this.workers,
                    { total: 1000000 }  // Total hashrate budget
                );
                await this.oriki.trigger('game:equilibrium', { allocations });

                // 2. Run selected algorithm
                await this.runAlgorithmCycle();

                // 3. Evaporate ant pheromones
                this.antColony.evaporate();

                // 4. Checkpoint if needed
                if (Date.now() - (this.state.lastCheckpoint || 0) > this.config.checkpointInterval) {
                    await this.saveCheckpoint();
                }

            } catch (err) {
                console.error('[ACLDQW] Cycle error:', err);
            }

            // Continue perpetually
            setImmediate(loop);
        };

        loop();
    }

    /**
     * Run algorithm cycle based on current mode
     */
    async runAlgorithmCycle() {
        switch (this.config.algorithm) {
            case SWARM_ALGORITHMS.BEE_COLONY:
                await this.runBeeColonyCycle();
                break;
            case SWARM_ALGORITHMS.FISH_SCHOOL:
                await this.runFishSchoolCycle();
                break;
            case SWARM_ALGORITHMS.ANT_COLONY:
                await this.runAntColonyCycle();
                break;
            case SWARM_ALGORITHMS.BIRD_FLOCK:
                await this.runBirdFlockCycle();
                break;
            case SWARM_ALGORITHMS.HYBRID:
            default:
                await this.runHybridCycle();
        }
    }

    async runBeeColonyCycle() {
        // Scout phase
        const discoveries = this.beeColony.scoutPhase(this.workers, [
            { id: 'pool1', reward: 1, difficulty: 1, latency: 50 },
            { id: 'pool2', reward: 1.2, difficulty: 1.5, latency: 100 }
        ]);

        // Forager phase
        const assignments = this.beeColony.foragerPhase(this.workers);

        // Execute mining based on assignments
        for (const assignment of assignments) {
            const worker = this.workers.find(w => w.id === assignment.workerId);
            if (worker) {
                worker.currentWork = assignment.source;
                this.state.totalHashes += BigInt(worker.hashrate);
            }
        }
    }

    async runFishSchoolCycle() {
        for (const fish of this.workers) {
            const movement = this.fishSchool.calculateMovement(fish, this.workers);
            fish.hashrate = movement.targetHashrate;
            this.state.totalHashes += BigInt(fish.hashrate);
        }
    }

    async runAntColonyCycle() {
        const paths = [
            { id: 'path1', difficulty: 1 },
            { id: 'path2', difficulty: 2 },
            { id: 'path3', difficulty: 0.5 }
        ];

        for (const ant of this.workers) {
            const selectedPath = this.antColony.selectPath(ant, paths);
            ant.currentWork = selectedPath;

            // Simulate work and deposit pheromone on success
            const success = Math.random() > 0.3;
            if (success) {
                this.antColony.depositPheromone(selectedPath, 1);
                this.state.totalShares++;
            }

            this.state.totalHashes += BigInt(ant.hashrate);
        }
    }

    async runBirdFlockCycle() {
        const formation = this.birdFlock.calculateFormation(this.workers);

        for (const position of formation) {
            const bird = this.workers.find(w => w.id === position.workerId);
            if (bird) {
                bird.hashrate *= position.efficiency;
                this.state.totalHashes += BigInt(Math.floor(bird.hashrate * position.workAllocation));
            }
        }
    }

    async runHybridCycle() {
        // Dynamically select best algorithm based on conditions
        const conditions = this.analyzeConditions();

        if (conditions.highCompetition) {
            await this.runFishSchoolCycle();  // School together for safety
        } else if (conditions.explorationNeeded) {
            await this.runBeeColonyCycle();  // Scout for new opportunities
        } else if (conditions.pathOptimization) {
            await this.runAntColonyCycle();  // Optimize known paths
        } else {
            await this.runBirdFlockCycle();  // Efficient formation
        }
    }

    analyzeConditions() {
        return {
            highCompetition: Math.random() > 0.7,
            explorationNeeded: this.workers.some(w => !w.currentWork),
            pathOptimization: this.antColony.pheromones.size > 5
        };
    }

    async saveCheckpoint() {
        const checkpoint = {
            algorithm: this.config.algorithm,
            workerCount: this.workers.length,
            totalHashes: this.state.totalHashes.toString(),
            totalShares: this.state.totalShares,
            uptime: Date.now() - this.state.startTime,
            workers: this.workers.map(w => ({
                id: w.id,
                role: w.role,
                hashrate: w.hashrate,
                shares: w.shares
            })),
            pheromones: Array.from(this.antColony.pheromones.entries()),
            savedAt: new Date().toISOString()
        };

        this.state.lastCheckpoint = Date.now();
        await this.oriki.trigger('checkpoint:save', checkpoint);

        console.log(`[ACLDQW] Checkpoint: ${this.state.totalShares} shares, ${this.workers.length} workers`);

        return checkpoint;
    }

    /**
     * Handle threat with murmuration response
     */
    async handleThreat(threat) {
        await this.oriki.trigger('swarm:threat', { threat });

        const responses = this.birdFlock.murmuration(this.workers, threat);

        for (const response of responses) {
            if (response.action === 'evade') {
                const worker = this.workers.find(w => w.id === response.workerId);
                if (worker) {
                    worker.currentPool = response.newTarget.pool;
                }
            }
        }

        await this.oriki.trigger('swarm:rebalance', { reason: 'threat_response' });
    }

    getStatus() {
        return {
            algorithm: Object.keys(SWARM_ALGORITHMS).find(k => SWARM_ALGORITHMS[k] === this.config.algorithm),
            workers: this.workers.length,
            totalHashes: this.state.totalHashes.toString(),
            totalShares: this.state.totalShares,
            uptime: Date.now() - this.state.startTime,
            roles: {
                queens: this.workers.filter(w => w.role === WORKER_ROLES.QUEEN).length,
                scouts: this.workers.filter(w => w.role === WORKER_ROLES.SCOUT).length,
                foragers: this.workers.filter(w => w.role === WORKER_ROLES.FORAGER).length,
                nurses: this.workers.filter(w => w.role === WORKER_ROLES.NURSE).length,
                drones: this.workers.filter(w => w.role === WORKER_ROLES.DRONE).length
            },
            pheromoneTrails: this.antColony.pheromones.size,
            waggleDances: this.beeColony.waggleDances.size
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Format constants
    ACLDQW_MAGIC,
    ACLDQW_VERSION,
    SWARM_ALGORITHMS,
    WORKER_ROLES,

    // Algorithms
    BeeColonyAlgorithm,
    FishSchoolAlgorithm,
    AntColonyAlgorithm,
    BirdFlockAlgorithm,

    // Game theory
    GameTheoryEngine,

    // Oriki
    OrikiHandlerManager,

    // Main coordinator
    ACLDQWSwarmCoordinator
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

if (require.main === module) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACLDQW - Biomimetic Swarm Mining with Game Theory             ║');
    console.log('║  🐝 Bees · 🐟 Fish · 🐜 Ants · 🐦 Birds                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();

    const coordinator = new ACLDQWSwarmCoordinator({
        algorithm: SWARM_ALGORITHMS.HYBRID,
        workerCount: 20
    });

    // Initialize with sample workers
    coordinator.initialize(
        Array(20).fill(null).map((_, i) => ({
            id: `swarm-worker-${i}`,
            hashrate: 50000 + Math.random() * 50000,
            pool: 'solo.ckpool.org'
        }))
    ).then(() => {
        // Start perpetual coordination
        coordinator.runPerpetual();

        // Status every 10 seconds
        setInterval(() => {
            const status = coordinator.getStatus();
            console.log(`[ACLDQW] Status: ${status.workers} workers, ${status.totalShares} shares, ${status.pheromoneTrails} trails`);
        }, 10000);
    });
}
