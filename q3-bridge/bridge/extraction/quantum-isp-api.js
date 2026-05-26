/**
 * QuantumISP API - JavaScript REST Interface
 * 
 * Exposes QuantumISP services via REST API integrated with cr8os-alter-api.js
 * Manages customers, bandwidth, QKD, billing, and SLA monitoring
 */

// =========================================================================
// QUANTUM ISP DATA STRUCTURES
// =========================================================================

// Service tiers
const ISP_TIERS = {
    1: { name: 'Basic', uptime: 95, fidelity: 0.95, latency: 100, keyRate: 100, basePrice: 1000 },
    2: { name: 'Professional', uptime: 98, fidelity: 0.98, latency: 50, keyRate: 1000, basePrice: 10000 },
    3: { name: 'Enterprise', uptime: 99.9, fidelity: 0.99, latency: 10, keyRate: 10000, basePrice: 100000 },
    4: { name: 'Government', uptime: 99.99, fidelity: 0.995, latency: 1, keyRate: 100000, basePrice: 1000000 }
};

// Pricing
const ISP_PRICING = {
    eprPerPair: 0.001,      // $0.001 per EPR pair
    qkdPerBit: 0.0001,      // $0.0001 per key bit
    gatePerOp: 0.01,        // $0.01 per quantum gate
    teleportPerQubit: 1.0,  // $1 per teleported qubit
    overageMultiplier: 2.0  // 2x for overage
};

// In-memory stores
let ispCustomers = new Map();
let ispAllocations = new Map();
let ispQKDSessions = new Map();
let ispUsageRecords = [];
let ispSLAViolations = [];

let customerIdCounter = 1000;
let sessionIdCounter = 500;
let allocationIdCounter = 100;

// =========================================================================
// CUSTOMER MANAGEMENT
// =========================================================================

/**
 * Create a new customer
 */
function createISPCustomer(name, tier, contact = {}) {
    const id = `isp-${++customerIdCounter}`;

    const customer = {
        id,
        name,
        tier: parseInt(tier) || 2,
        tierInfo: ISP_TIERS[tier] || ISP_TIERS[2],
        contact: {
            email: contact.email || '',
            phone: contact.phone || '',
            address: contact.address || ''
        },
        quotas: {
            eprPairs: ISP_TIERS[tier].basePrice * 1000,      // ~1M for basic, more for higher
            qkdBits: ISP_TIERS[tier].basePrice * 10000,     // ~10M for basic
            quantumGates: ISP_TIERS[tier].basePrice * 10    // ~10K for basic
        },
        usage: {
            eprPairs: 0,
            qkdBits: 0,
            quantumGates: 0,
            teleportations: 0
        },
        createdAt: Date.now(),
        status: 'active',
        qDomains: [],       // Linked .q domains
        q3Sites: []         // Linked Q3 sites
    };

    ispCustomers.set(id, customer);
    console.log(`[ISP] 👤 Customer created: ${name} (${ISP_TIERS[tier].name})`);

    return customer;
}

/**
 * Get customer by ID
 */
function getISPCustomer(customerId) {
    return ispCustomers.get(customerId) || null;
}

/**
 * List all customers
 */
function listISPCustomers() {
    return Array.from(ispCustomers.values());
}

/**
 * Update customer
 */
function updateISPCustomer(customerId, updates) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return null;

    if (updates.name) customer.name = updates.name;
    if (updates.tier) {
        customer.tier = updates.tier;
        customer.tierInfo = ISP_TIERS[updates.tier];
    }
    if (updates.contact) Object.assign(customer.contact, updates.contact);
    if (updates.status) customer.status = updates.status;

    return customer;
}

// =========================================================================
// BANDWIDTH ALLOCATION
// =========================================================================

/**
 * Allocate EPR bandwidth to customer
 */
function allocateBandwidth(customerId, rateKHz, fidelity) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    // Check tier limits
    const maxFidelity = customer.tierInfo.fidelity;
    if (fidelity > maxFidelity) {
        return { error: `Requested fidelity ${fidelity} exceeds tier limit ${maxFidelity}` };
    }

    const id = `alloc-${++allocationIdCounter}`;

    const allocation = {
        id,
        customerId,
        rateKHz,
        fidelity,
        channelId: Math.floor(Math.random() * 15) + 1,
        status: 'active',
        createdAt: Date.now(),
        usage: { totalPairs: 0 }
    };

    ispAllocations.set(id, allocation);
    console.log(`[ISP] ⚡ Bandwidth allocated: ${rateKHz} kHz @ ${fidelity} for ${customerId}`);

    return { success: true, allocation };
}

/**
 * Release bandwidth
 */
function releaseBandwidth(allocationId) {
    const allocation = ispAllocations.get(allocationId);
    if (!allocation) return { error: 'Allocation not found' };

    ispAllocations.delete(allocationId);
    return { success: true, released: allocationId };
}

/**
 * Get customer's allocations
 */
function getCustomerAllocations(customerId) {
    return Array.from(ispAllocations.values())
        .filter(a => a.customerId === customerId);
}

// =========================================================================
// QKD SERVICE
// =========================================================================

/**
 * Provision QKD service
 */
function provisionQKD(customerId, protocol, keyRateBps) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    const supportedProtocols = ['BB84', 'E91', 'B92', 'SARG04'];
    if (!supportedProtocols.includes(protocol)) {
        return { error: `Unsupported protocol. Use: ${supportedProtocols.join(', ')}` };
    }

    // Check tier key rate limits
    const maxKeyRate = customer.tierInfo.keyRate;
    if (keyRateBps > maxKeyRate) {
        return { error: `Requested key rate ${keyRateBps} exceeds tier limit ${maxKeyRate}` };
    }

    const id = `qkd-${++sessionIdCounter}`;

    const session = {
        id,
        customerId,
        protocol,
        keyRateBps,
        status: 'active',
        createdAt: Date.now(),
        totalBitsGenerated: 0,
        qber: 0.02 + Math.random() * 0.01  // 2-3% baseline QBER
    };

    ispQKDSessions.set(id, session);
    console.log(`[ISP] 🔐 QKD session: ${protocol} @ ${keyRateBps} bps for ${customerId}`);

    return { success: true, session };
}

/**
 * Generate key bits
 */
function generateKeyBits(sessionId, numBits) {
    const session = ispQKDSessions.get(sessionId);
    if (!session) return { error: 'Session not found' };

    session.totalBitsGenerated += numBits;

    // Update customer usage
    const customer = ispCustomers.get(session.customerId);
    if (customer) {
        customer.usage.qkdBits += numBits;
    }

    // Generate simulated key (would be real quantum in production)
    const key = Array(Math.min(numBits, 64)).fill(0).map(() => Math.random() > 0.5 ? 1 : 0).join('');

    return {
        success: true,
        bitsGenerated: numBits,
        sessionTotal: session.totalBitsGenerated,
        sampleKey: key + (numBits > 64 ? '...' : '')
    };
}

/**
 * Get session QBER
 */
function getSessionQBER(sessionId) {
    const session = ispQKDSessions.get(sessionId);
    if (!session) return { error: 'Session not found' };

    // QBER threshold for BB84 is ~11%
    const isSecure = session.qber < 0.11;

    return {
        sessionId,
        qber: session.qber,
        qberPercent: (session.qber * 100).toFixed(2) + '%',
        status: isSecure ? 'SECURE' : 'WARNING: Possible eavesdropping',
        threshold: '11%'
    };
}

// =========================================================================
// BILLING
// =========================================================================

/**
 * Calculate monthly bill
 */
function calculateBill(customerId) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    const tier = customer.tierInfo;
    const usage = customer.usage;
    const quotas = customer.quotas;

    // Base fee
    let baseFee = tier.basePrice;

    // Calculate overages
    const eprOverage = Math.max(0, usage.eprPairs - quotas.eprPairs);
    const qkdOverage = Math.max(0, usage.qkdBits - quotas.qkdBits);
    const gatesOverage = Math.max(0, usage.quantumGates - quotas.quantumGates);

    const overageCharges =
        eprOverage * ISP_PRICING.eprPerPair * ISP_PRICING.overageMultiplier +
        qkdOverage * ISP_PRICING.qkdPerBit * ISP_PRICING.overageMultiplier +
        gatesOverage * ISP_PRICING.gatePerOp * ISP_PRICING.overageMultiplier +
        usage.teleportations * ISP_PRICING.teleportPerQubit;

    // SLA credits
    const slaCredits = calculateSLACredits(customerId, baseFee);

    const total = baseFee + overageCharges - slaCredits;

    return {
        customerId,
        customerName: customer.name,
        tier: tier.name,
        period: new Date().toISOString().slice(0, 7),  // YYYY-MM
        baseFee,
        usage: {
            eprPairs: usage.eprPairs,
            qkdBits: usage.qkdBits,
            quantumGates: usage.quantumGates,
            teleportations: usage.teleportations
        },
        quotas,
        overages: { eprPairs: eprOverage, qkdBits: qkdOverage, quantumGates: gatesOverage },
        overageCharges,
        slaCredits,
        total: Math.max(0, total),
        currency: 'USD'
    };
}

/**
 * Calculate SLA credits
 */
function calculateSLACredits(customerId, monthlyBill) {
    const violations = ispSLAViolations.filter(v =>
        v.customerId === customerId && !v.credited
    );

    if (violations.length === 0) return 0;

    const customer = ispCustomers.get(customerId);
    const creditRate = [0.05, 0.10, 0.15, 0.25][customer.tier - 1] || 0.10;

    let totalCredit = violations.length * monthlyBill * creditRate;

    // Cap at 50%
    totalCredit = Math.min(totalCredit, monthlyBill * 0.5);

    // Mark as credited
    violations.forEach(v => v.credited = true);

    return totalCredit;
}

// =========================================================================
// SLA MONITORING
// =========================================================================

/**
 * Record performance metrics
 */
function recordMetrics(customerId, uptime, fidelity, latency, keyRate) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    const metrics = {
        customerId,
        timestamp: Date.now(),
        uptime,
        fidelity,
        latency,
        keyRate
    };

    ispUsageRecords.push(metrics);

    // Check SLA
    const tier = customer.tierInfo;
    const violations = [];

    if (uptime < tier.uptime) {
        violations.push({ type: 'uptime', threshold: tier.uptime, actual: uptime });
    }
    if (fidelity < tier.fidelity) {
        violations.push({ type: 'fidelity', threshold: tier.fidelity, actual: fidelity });
    }
    if (latency > tier.latency) {
        violations.push({ type: 'latency', threshold: tier.latency, actual: latency });
    }
    if (keyRate < tier.keyRate) {
        violations.push({ type: 'keyRate', threshold: tier.keyRate, actual: keyRate });
    }

    // Record violations
    violations.forEach(v => {
        ispSLAViolations.push({
            customerId,
            ...v,
            timestamp: Date.now(),
            credited: false
        });
    });

    return {
        customerId,
        status: violations.length === 0 ? 'COMPLIANT' : 'VIOLATION',
        violations
    };
}

/**
 * Get SLA report
 */
function getSLAReport(customerId) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    const records = ispUsageRecords.filter(r => r.customerId === customerId);
    const violations = ispSLAViolations.filter(v => v.customerId === customerId);

    // Calculate averages
    const avgUptime = records.reduce((sum, r) => sum + r.uptime, 0) / (records.length || 1);
    const avgFidelity = records.reduce((sum, r) => sum + r.fidelity, 0) / (records.length || 1);
    const avgLatency = records.reduce((sum, r) => sum + r.latency, 0) / (records.length || 1);
    const avgKeyRate = records.reduce((sum, r) => sum + r.keyRate, 0) / (records.length || 1);

    const tier = customer.tierInfo;

    return {
        customerId,
        customerName: customer.name,
        tier: tier.name,
        metrics: {
            uptime: { average: avgUptime.toFixed(2) + '%', threshold: tier.uptime + '%', compliant: avgUptime >= tier.uptime },
            fidelity: { average: avgFidelity.toFixed(3), threshold: tier.fidelity, compliant: avgFidelity >= tier.fidelity },
            latency: { average: avgLatency.toFixed(1) + 'ms', threshold: tier.latency + 'ms', compliant: avgLatency <= tier.latency },
            keyRate: { average: Math.round(avgKeyRate) + 'bps', threshold: tier.keyRate + 'bps', compliant: avgKeyRate >= tier.keyRate }
        },
        totalViolations: violations.length,
        creditedViolations: violations.filter(v => v.credited).length,
        recordCount: records.length
    };
}

// =========================================================================
// Q3/QDP INTEGRATION
// =========================================================================

/**
 * Link customer to Q3 site
 */
function linkQ3Site(customerId, siteId) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    if (!customer.q3Sites.includes(siteId)) {
        customer.q3Sites.push(siteId);
    }

    return { success: true, customer };
}

/**
 * Link customer to .q domain
 */
function linkQDomain(customerId, domain) {
    const customer = ispCustomers.get(customerId);
    if (!customer) return { error: 'Customer not found' };

    if (!customer.qDomains.includes(domain)) {
        customer.qDomains.push(domain);
    }

    return { success: true, customer };
}

/**
 * Get ISP stats
 */
function getISPStats() {
    const customers = Array.from(ispCustomers.values());
    const allocations = Array.from(ispAllocations.values());
    const sessions = Array.from(ispQKDSessions.values());

    return {
        customers: {
            total: customers.length,
            byTier: {
                basic: customers.filter(c => c.tier === 1).length,
                professional: customers.filter(c => c.tier === 2).length,
                enterprise: customers.filter(c => c.tier === 3).length,
                government: customers.filter(c => c.tier === 4).length
            }
        },
        bandwidth: {
            activeAllocations: allocations.filter(a => a.status === 'active').length,
            totalRateKHz: allocations.reduce((sum, a) => sum + a.rateKHz, 0)
        },
        qkd: {
            activeSessions: sessions.filter(s => s.status === 'active').length,
            totalBitsGenerated: sessions.reduce((sum, s) => sum + s.totalBitsGenerated, 0),
            protocolBreakdown: {
                BB84: sessions.filter(s => s.protocol === 'BB84').length,
                E91: sessions.filter(s => s.protocol === 'E91').length
            }
        },
        sla: {
            totalViolations: ispSLAViolations.length,
            uncreditedViolations: ispSLAViolations.filter(v => !v.credited).length
        }
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    // Data
    ISP_TIERS,
    ISP_PRICING,

    // Customer
    createISPCustomer,
    getISPCustomer,
    listISPCustomers,
    updateISPCustomer,

    // Bandwidth
    allocateBandwidth,
    releaseBandwidth,
    getCustomerAllocations,

    // QKD
    provisionQKD,
    generateKeyBits,
    getSessionQBER,

    // Billing
    calculateBill,
    calculateSLACredits,

    // SLA
    recordMetrics,
    getSLAReport,

    // Integration
    linkQ3Site,
    linkQDomain,
    getISPStats
};
