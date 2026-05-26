/**
 * Q3 Site Sync Script
 * 
 * Syncs Q3 sites from local storage to Q3 Carrier S3 in edge-compatible format.
 * This allows the Cloudflare Worker to serve sites directly from S3.
 * 
 * Usage:
 *   node scripts/sync-sites.js [--site <siteId>]
 * 
 * Options:
 *   --site <siteId>  Sync only a specific site
 *   --all            Sync all sites (default)
 *   --dry-run        Show what would be synced without uploading
 */

const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Load config
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const s3Client = new S3Client({
    endpoint: process.env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.eu',
    region: process.env.Q3_CARRIER_REGION || 'eu-west-1',
    credentials: {
        accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
        secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
    },
    forcePathStyle: true,
});

const BUCKET = process.env.Q3_CARRIER_BUCKET || 'cr8os1';
const Q3_STORAGE_DIR = path.join(__dirname, '../../.q3-native');
const Q3_SITES_PREFIX = 'q3/sites';
const Q3_ROUTING_PREFIX = 'q3/routing';

/**
 * Load Q3 storage instance to get site data
 */
function loadQ3Storage() {
    const { getQ3NativeStorage } = require('../../q3-native-storage');
    return getQ3NativeStorage();
}

/**
 * Sync a single site to S3
 */
async function syncSite(q3, site, dryRun = false) {
    console.log(`\n📦 Syncing site: ${site.name} (${site.siteId})`);
    console.log(`   Subdomain: ${site.subdomain}`);
    console.log(`   Files: ${site.files.length}`);

    // 1. Upload site manifest
    const manifestKey = `${Q3_SITES_PREFIX}/${site.siteId}/manifest.json`;
    const manifest = {
        siteId: site.siteId,
        name: site.name,
        subdomain: site.subdomain,
        indexFile: site.indexFile,
        files: site.files.map(f => ({
            path: f.path,
            contentType: f.contentType,
            size: f.size,
        })),
        createdAt: site.createdAt,
        updatedAt: Date.now(),
    };

    if (!dryRun) {
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: manifestKey,
            Body: JSON.stringify(manifest, null, 2),
            ContentType: 'application/json',
        }));
        console.log(`   ✅ Uploaded manifest: ${manifestKey}`);
    } else {
        console.log(`   [DRY-RUN] Would upload: ${manifestKey}`);
    }

    // 2. Upload each file
    for (const file of site.files) {
        const fileKey = `${Q3_SITES_PREFIX}/${site.siteId}/files/${file.path}`;

        // Retrieve file data from Q3
        let fileData;
        try {
            const result = await q3.retrieve(file.objectId);
            fileData = result.data;
        } catch (err) {
            console.log(`   ⚠️  Could not retrieve ${file.path}: ${err.message}`);
            continue;
        }

        if (!dryRun) {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET,
                Key: fileKey,
                Body: fileData,
                ContentType: file.contentType,
            }));
            console.log(`   ✅ Uploaded: ${file.path} (${formatBytes(file.size)})`);
        } else {
            console.log(`   [DRY-RUN] Would upload: ${file.path} (${formatBytes(file.size)})`);
        }
    }

    // 3. Create subdomain routing entry
    const routingKey = `${Q3_ROUTING_PREFIX}/${site.subdomain}.json`;
    const routing = {
        siteId: site.siteId,
        subdomain: site.subdomain,
        createdAt: site.createdAt,
    };

    if (!dryRun) {
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: routingKey,
            Body: JSON.stringify(routing),
            ContentType: 'application/json',
        }));
        console.log(`   ✅ Created routing: ${site.subdomain} → ${site.siteId}`);
    } else {
        console.log(`   [DRY-RUN] Would create routing: ${site.subdomain} → ${site.siteId}`);
    }

    console.log(`   🎉 Site synced successfully!`);
    return true;
}

/**
 * Sync all sites to S3
 */
async function syncAllSites(dryRun = false) {
    const q3 = loadQ3Storage();
    const sites = q3.listSites();

    console.log('═══════════════════════════════════════════════════════');
    console.log('  Q3 Site Sync → Q3 Carrier S3');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Bucket: ${BUCKET}`);
    console.log(`  Sites to sync: ${sites.length}`);
    console.log(`  Dry run: ${dryRun}`);
    console.log('═══════════════════════════════════════════════════════');

    if (sites.length === 0) {
        console.log('\n⚠️  No sites found to sync.');
        return;
    }

    let synced = 0;
    let failed = 0;

    for (const siteInfo of sites) {
        try {
            // Get full site data
            const site = q3.sites.get(siteInfo.siteId);
            if (site) {
                await syncSite(q3, site, dryRun);
                synced++;
            }
        } catch (err) {
            console.error(`   ❌ Failed to sync ${siteInfo.name}: ${err.message}`);
            failed++;
        }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  Sync complete: ${synced} synced, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════');
}

/**
 * Sync a specific site by ID
 */
async function syncSiteById(siteId, dryRun = false) {
    const q3 = loadQ3Storage();
    const site = q3.sites?.get(siteId);

    if (!site) {
        console.error(`❌ Site not found: ${siteId}`);
        console.log('\nAvailable sites:');
        q3.listSites().forEach(s => console.log(`  - ${s.siteId}: ${s.name}`));
        return;
    }

    await syncSite(q3, site, dryRun);
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// CLI Entry Point
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const siteIdIndex = args.indexOf('--site');

    try {
        if (siteIdIndex !== -1 && args[siteIdIndex + 1]) {
            await syncSiteById(args[siteIdIndex + 1], dryRun);
        } else {
            await syncAllSites(dryRun);
        }
    } catch (err) {
        console.error('Sync failed:', err.message);
        process.exit(1);
    }
}

main();
