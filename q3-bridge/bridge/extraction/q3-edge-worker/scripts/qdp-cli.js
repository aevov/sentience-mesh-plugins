#!/usr/bin/env node
/**
 * QDP CLI - Quantum Domain Protocol Command Line Tool
 * 
 * Usage:
 *   qdp register mysite              # Register mysite.q
 *   qdp resolve mysite               # Lookup mysite.q
 *   qdp link mysite site-abc123      # Link to Q3 site
 *   qdp transfer mysite newowner     # Transfer ownership
 *   qdp list                         # List your domains
 *   qdp stats                        # System statistics
 *   qdp check google                 # Check if available/protected
 */

const https = require('https');
const http = require('http');

// Config
const API_BASE = process.env.QDP_API || 'http://localhost:7472/api/qdp';
const OWNER = process.env.QDP_OWNER || 'cli-user';

// Colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function color(c, text) {
    return `${colors[c]}${text}${colors.reset}`;
}

/**
 * Make API request
 */
async function apiRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${API_BASE}${path}`);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data: { raw: data } });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

/**
 * Commands
 */
const commands = {
    async register(name) {
        if (!name) {
            console.log(color('red', 'Usage: qdp register <domain>'));
            return;
        }

        console.log(color('cyan', `\n🌐 Registering ${name}.q...\n`));

        const result = await apiRequest('POST', '/register', {
            name,
            owner: OWNER
        });

        if (result.status === 200) {
            console.log(color('green', '✅ Domain registered!'));
            console.log(`   Domain: ${color('bright', result.data.domain)}`);
            console.log(`   Address: ${color('cyan', result.data.quantumAddress || 'Not linked')}`);
        } else {
            console.log(color('red', `❌ ${result.data.message || result.data.error}`));
            if (result.data.reason === 'brand-protected') {
                console.log(color('yellow', '   Submit trademark proof to brand-claims@cr8os.io'));
            }
        }
    },

    async resolve(name) {
        if (!name) {
            console.log(color('red', 'Usage: qdp resolve <domain>'));
            return;
        }

        console.log(color('cyan', `\n🔍 Resolving ${name}.q...\n`));

        const result = await apiRequest('GET', `/resolve/${name}`);

        if (result.data.reserved) {
            console.log(color('magenta', `👑 ${name}.q is RESERVED (platform owned)`));
        } else if (result.data.available) {
            console.log(color('green', `✨ ${name}.q is AVAILABLE!`));
            console.log(`   Run: ${color('cyan', `qdp register ${name}`)}`);
        } else if (result.data.qdr) {
            console.log(color('bright', `📄 ${name}.q`));
            console.log(`   Owner: ${result.data.qdr.owner}`);
            console.log(`   Site ID: ${result.data.qdr.siteId || 'Not linked'}`);
            console.log(`   Address: ${color('cyan', result.data.qdr.records?.root || 'None')}`);
            console.log(`   Registered: ${new Date(result.data.qdr.registeredAt).toISOString()}`);
        }
    },

    async check(name) {
        // Alias for resolve with different messaging
        return this.resolve(name);
    },

    async link(domain, siteId) {
        if (!domain || !siteId) {
            console.log(color('red', 'Usage: qdp link <domain> <siteId>'));
            return;
        }

        console.log(color('cyan', `\n🔗 Linking ${domain}.q to ${siteId}...\n`));

        const result = await apiRequest('PUT', `/${domain}/link`, { siteId });

        if (result.status === 200) {
            console.log(color('green', '✅ Domain linked!'));
            console.log(`   Address: ${color('cyan', result.data.quantumAddress)}`);
        } else {
            console.log(color('red', `❌ ${result.data.error}`));
        }
    },

    async transfer(domain, newOwner) {
        if (!domain || !newOwner) {
            console.log(color('red', 'Usage: qdp transfer <domain> <newOwner>'));
            return;
        }

        console.log(color('cyan', `\n🔄 Transferring ${domain}.q to ${newOwner}...\n`));

        const result = await apiRequest('POST', `/${domain}/transfer`, {
            currentOwner: OWNER,
            newOwner
        });

        if (result.status === 200) {
            console.log(color('green', '✅ Domain transferred!'));
            console.log(`   From: ${result.data.previousOwner}`);
            console.log(`   To: ${color('bright', result.data.newOwner)}`);
        } else {
            console.log(color('red', `❌ ${result.data.error}`));
        }
    },

    async list() {
        console.log(color('cyan', '\n📋 Listing registered domains...\n'));

        const result = await apiRequest('GET', '/domains');

        console.log(`Total: ${color('bright', result.data.count)} domains`);
        console.log(`Reserved: ${color('magenta', result.data.reserved)} (platform)\n`);

        if (result.data.domains.length === 0) {
            console.log(color('yellow', '   No domains registered yet'));
        } else {
            for (const d of result.data.domains) {
                console.log(`   ${color('green', d.domain)} - Owner: ${d.owner}, Site: ${d.siteId || 'unlinked'}`);
            }
        }
    },

    async stats() {
        console.log(color('cyan', '\n📊 QDP System Statistics\n'));

        const result = await apiRequest('GET', '/stats');

        console.log(color('bright', '  System:'));
        console.log(`   Registered Domains: ${result.data.system.totalDomains}`);
        console.log(`   Reserved Domains: ${result.data.system.reservedDomains}`);
        console.log(`   Protected Brands: ${result.data.system.protectedBrands}`);
        console.log(`   Supported TLDs: ${result.data.system.supportedTLDs.join(', ')}`);

        console.log(color('bright', '\n  Analytics:'));
        console.log(`   Total Visits: ${result.data.analytics.totalVisits}`);
        console.log(`   Bandwidth: ${result.data.analytics.totalBandwidthGB} GB`);
    },

    async subdomain(parent, sub, siteId) {
        if (!parent || !sub) {
            console.log(color('red', 'Usage: qdp subdomain <parent> <subdomain> [siteId]'));
            return;
        }

        console.log(color('cyan', `\n🔗 Creating ${sub}.${parent}.q...\n`));

        const result = await apiRequest('POST', `/${parent}/subdomain`, {
            subdomain: sub,
            siteId
        });

        if (result.status === 200) {
            console.log(color('green', '✅ Subdomain created!'));
            console.log(`   Full domain: ${color('bright', result.data.subdomain)}`);
        } else {
            console.log(color('red', `❌ ${result.data.error}`));
        }
    },

    async purge(domain) {
        if (!domain) {
            console.log(color('red', 'Usage: qdp purge <domain>'));
            return;
        }

        console.log(color('cyan', `\n🗑️  Purging cache for ${domain}.q...\n`));

        const result = await apiRequest('POST', `/${domain}/purge`);

        if (result.status === 200) {
            console.log(color('green', '✅ Cache purge requested'));
        } else {
            console.log(color('red', `❌ ${result.data.error}`));
        }
    },

    help() {
        console.log(`
${color('bright', 'QDP CLI - Quantum Domain Protocol')}
${color('cyan', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

${color('bright', 'Commands:')}
  ${color('green', 'register')} <domain>              Register a new .q domain
  ${color('green', 'resolve')} <domain>               Lookup domain (alias: check)
  ${color('green', 'link')} <domain> <siteId>         Link domain to Q3 site
  ${color('green', 'transfer')} <domain> <newOwner>   Transfer ownership
  ${color('green', 'subdomain')} <parent> <sub>       Create subdomain
  ${color('green', 'list')}                           List all registered domains
  ${color('green', 'stats')}                          Show system statistics
  ${color('green', 'purge')} <domain>                 Purge edge cache

${color('bright', 'Examples:')}
  qdp register mysite
  qdp link mysite site-abc123
  qdp subdomain mysite api
  qdp transfer mysite 0xNewOwner

${color('bright', 'Environment:')}
  QDP_API     API base URL (default: http://localhost:7472/api/qdp)
  QDP_OWNER   Your owner identifier

${color('cyan', 'Powered by Quantum Domain Protocol - Web 5')}
`);
    }
};

// Main
async function main() {
    const args = process.argv.slice(2);
    const cmd = args[0]?.toLowerCase();

    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
        commands.help();
        return;
    }

    if (commands[cmd]) {
        try {
            await commands[cmd](...args.slice(1));
        } catch (err) {
            console.log(color('red', `\n❌ Error: ${err.message}`));
            console.log(color('yellow', '   Is the API server running?'));
        }
    } else {
        console.log(color('red', `Unknown command: ${cmd}`));
        console.log(`Run ${color('cyan', 'qdp help')} for usage`);
    }
}

main();
