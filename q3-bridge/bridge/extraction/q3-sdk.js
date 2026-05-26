#!/usr/bin/env node
/**
 * Q3 Protocol - JavaScript SDK
 * S3-compatible client for Quantum Cube Storage
 * 
 * Usage:
 *   const Q3Client = require('./q3-sdk');
 *   const client = new Q3Client({ endpoint: 'http://localhost:7472' });
 *   await client.createBucket('my-bucket');
 *   await client.putObject('my-bucket', 'file.txt', 'Hello Q3!');
 */

class Q3Client {
    constructor(options = {}) {
        this.endpoint = options.endpoint || 'http://localhost:7472';
        this.apiBase = `${this.endpoint}/api/q3`;
    }

    /**
     * Create a new bucket
     */
    async createBucket(name, options = {}) {
        const response = await fetch(`${this.apiBase}/buckets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, ...options })
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to create bucket');
        }

        return data.bucket;
    }

    /**
     * List all buckets
     */
    async listBuckets() {
        const response = await fetch(`${this.apiBase}/buckets`);
        const data = await response.json();
        return data.buckets || [];
    }

    /**
     * Upload an object
     */
    async putObject(bucket, key, data, metadata = {}) {
        const response = await fetch(`${this.apiBase}/${bucket}/${key}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Q3-Version': '1.0'
            },
            body: JSON.stringify({ data, metadata })
        });

        return await response.json();
    }

    /**
     * Download an object
     */
    async getObject(bucket, key) {
        const response = await fetch(`${this.apiBase}/${bucket}/${key}`);

        if (!response.ok) {
            throw new Error(`Object not found: ${bucket}/${key}`);
        }

        return await response.text();
    }

    /**
     * Delete an object
     */
    async deleteObject(bucket, key) {
        const response = await fetch(`${this.apiBase}/${bucket}/${key}`, {
            method: 'DELETE'
        });

        return await response.json();
    }

    /**
     * List objects in a bucket
     */
    async listObjects(bucket, prefix = '') {
        const url = new URL(`${this.apiBase}/${bucket}/objects`);
        if (prefix) url.searchParams.set('prefix', prefix);

        const response = await fetch(url);
        const data = await response.json();
        return data.objects || [];
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        const response = await fetch(`${this.apiBase}/stats`);
        return await response.json();
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const client = new Q3Client();

    (async () => {
        try {
            switch (command) {
                case 'create-bucket':
                    const bucket = await client.createBucket(args[1]);
                    console.log('✅ Bucket created:', bucket.name);
                    break;

                case 'list-buckets':
                    const buckets = await client.listBuckets();
                    console.log('Buckets:', buckets.map(b => b.name).join(', '));
                    break;

                case 'put':
                    await client.putObject(args[1], args[2], args[3]);
                    console.log(`✅ Uploaded: ${args[1]}/${args[2]}`);
                    break;

                case 'get':
                    const data = await client.getObject(args[1], args[2]);
                    console.log(data);
                    break;

                case 'stats':
                    const stats = await client.getStats();
                    console.log('Q3 Storage Stats:', stats);
                    break;

                default:
                    console.log('Q3 Protocol - JavaScript SDK');
                    console.log('\nUsage:');
                    console.log('  node q3-sdk.js create-bucket <name>');
                    console.log('  node q3-sdk.js list-buckets');
                    console.log('  node q3-sdk.js put <bucket> <key> <data>');
                    console.log('  node q3-sdk.js get <bucket> <key>');
                    console.log('  node q3-sdk.js stats');
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = Q3Client;
